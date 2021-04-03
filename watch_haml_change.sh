#!/bin/bash
fswatch -o . | xargs -n1 -I "{}" bash -c "haml index.haml > index.html"
