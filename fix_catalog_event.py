import re

with open('src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()

# Make sure UIEvent is imported
if "UIEvent" not in content[:500]:
    content = content.replace("import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState, UIEvent } from 'react';")
    content = content.replace("React.UIEvent", "UIEvent")

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)
