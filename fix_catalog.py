import re

with open('src/pages/CatalogPage.tsx', 'r') as f:
    content = f.read()

# Move the updateSearchParams function higher up
func_str = """  function updateSearchParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    mutator(params);
    setSearchParams(params);
  }"""

content = content.replace(func_str, "")

# Insert it right before it's used
insert_point = "  // Closing animation for filter sheet"
content = content.replace(insert_point, func_str + "\n\n" + insert_point)

with open('src/pages/CatalogPage.tsx', 'w') as f:
    f.write(content)
