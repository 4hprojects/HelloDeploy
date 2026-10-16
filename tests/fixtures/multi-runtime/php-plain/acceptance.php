<?php
header('Content-Type: application/json');
echo json_encode(['fixture' => 'php-plain', 'ok' => true, 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION]);
