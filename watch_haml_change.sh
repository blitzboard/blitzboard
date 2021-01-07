#!/bin/bash
fswatch -o . | xargs -n1 -I "{}" bash -c "haml hellograph.haml > hellograph.html"
