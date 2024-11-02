#!/bin/bash
set -e
cp emscriptenbuild/libgit2/examples/lg2_async.wasm .
cp emscriptenbuild/libgit2/examples/lg2_async.js .
echo "publish --dry-run (run npm publish to finalize)"
npm publish --dry-run