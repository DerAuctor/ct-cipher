#!/bin/bash
cd /home/auctor/srv/ct-cipher
exec node ./dist/src/app/index.js "$@"
