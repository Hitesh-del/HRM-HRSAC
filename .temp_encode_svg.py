import base64
from pathlib import Path
p = Path(r'd:\HRM SYSTEM HRSAC\hrm-system-code\public\images\logo\logo-icon.svg')
svg = p.read_text(encoding='utf-8')
print(base64.b64encode(svg.encode('utf-8')).decode())
