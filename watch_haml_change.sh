#!/bin/bash
fswatch -o *.haml | xargs -n1 -I "{}" bash -c "echo changed && haml index.haml > index.html && haml showcase.haml > showcase.html"