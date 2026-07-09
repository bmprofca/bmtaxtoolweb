<?php
declare(strict_types=1);

/**
 * Same-origin API proxy for Hostinger shared hosting.
 * Uses IP resolve because shared PHP often cannot DNS-resolve toolserver.bmtaxopc.com.
 */

$backendHost = 'toolserver.bmtaxopc.com';
$backendBase = 'https://toolserver.bmtaxopc.com/api';
$backendIps = [
    '2.57.91.41',
    '84.32.84.51',
    '91.108.106.251',
    '147.79.69.217',
    '88.222.243.166',
    '147.79.69.73',
];

$path = isset($_GET['__path']) ? (string) $_GET['__path'] : '';
unset($_GET['__path']);

$targetPath = $path === '' ? '' : '/' . ltrim($path, '/');
$query = http_build_query($_GET);
$targetUrl = rtrim($backendBase, '/') . $targetPath . ($query !== '' ? '?' . $query : '');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rawBody = file_get_contents('php://input');

$forwardHeaders = [];
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower((string) $name);
        if ($lower === 'host' || $lower === 'content-length') {
            continue;
        }
        $forwardHeaders[] = $name . ': ' . $value;
    }
} else {
    foreach ($_SERVER as $key => $value) {
        if (!is_string($key) || !str_starts_with($key, 'HTTP_')) {
            continue;
        }
        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        if (strtolower($name) === 'host') {
            continue;
        }
        $forwardHeaders[] = $name . ': ' . $value;
    }
}

$forwardHeaders[] = 'Host: ' . $backendHost;

$lastError = 'API backend unreachable';
$response = false;
$status = 502;
$rawHeaders = '';
$body = '';

foreach ($backendIps as $ip) {
    $ch = curl_init($targetUrl);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $forwardHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_RESOLVE => ["{$backendHost}:443:{$ip}"],
    ]);

    if ($rawBody !== false && $rawBody !== '') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
    }

    $response = curl_exec($ch);

    if ($response !== false) {
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $rawHeaders = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);
        curl_close($ch);
        break;
    }

    $lastError = curl_error($ch) ?: $lastError;
    curl_close($ch);
}

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'API backend unreachable: ' . $lastError]);
    exit;
}

http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

foreach (explode("\r\n", $rawHeaders) as $line) {
    if ($line === '' || !str_contains($line, ':')) {
        continue;
    }
    [$name, $value] = explode(':', $line, 2);
    $lower = strtolower(trim($name));
    if (in_array($lower, ['transfer-encoding', 'content-length', 'connection', 'content-type'], true)) {
        continue;
    }
    header(trim($name) . ': ' . trim($value), false);
}

echo $body;
