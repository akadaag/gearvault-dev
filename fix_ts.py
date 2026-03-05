import re

for filepath in ['src/pages/EventsPage.tsx', 'src/pages/CatalogPage.tsx']:
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Remove UIEvent from standard import and add as type import
    content = content.replace(", UIEvent }", "}")
    
    # Find the react import
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if "import " in line and "from 'react'" in line:
            lines.insert(i+1, "import type { UIEvent } from 'react';")
            break
            
    with open(filepath, 'w') as f:
        f.write('\n'.join(lines))
