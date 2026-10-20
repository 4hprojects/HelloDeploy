<?php

namespace Fixture;

final class Probe
{
    public static function report(): array
    {
        return ['fixture' => 'php-composer', 'ok' => true, 'autoload' => true];
    }
}
