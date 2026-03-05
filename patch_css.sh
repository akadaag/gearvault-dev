#!/bin/bash
# Patch gap to 8px in .ev-ios-toolbar
sed -i '' 's/gap: 4px;/gap: 8px;/g' src/index.css
# But let's be careful, we need to do this for .ios-catalog-toolbar as well
