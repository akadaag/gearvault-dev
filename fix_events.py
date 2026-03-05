import re

with open('src/pages/EventsPage.tsx', 'r') as f:
    content = f.read()

# Make sure UIEvent is imported
if "UIEvent" not in content[:500]:
    content = content.replace("import { useMemo, useEffect, useState } from 'react';", "import { useMemo, useEffect, useState, UIEvent } from 'react';")
    content = content.replace("React.UIEvent", "UIEvent")

with open('src/pages/EventsPage.tsx', 'w') as f:
    f.write(content)
