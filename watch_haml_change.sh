#!/bin/bash
fswatch -o index.haml | xargs -n1 -I "{}" bash -c "echo changed && haml index.haml > index.html"
