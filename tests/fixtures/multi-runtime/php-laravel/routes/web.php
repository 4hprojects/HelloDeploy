<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/acceptance', function () {
    return response()->json([
        'fixture' => 'php-laravel',
        'ok' => true,
        'laravel' => app()->version(),
    ]);
});
