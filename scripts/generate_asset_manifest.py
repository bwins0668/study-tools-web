import os
import re
import json
import hashlib
from datetime import datetime, timezone

# 1. Parse versions from assets/js/version.js
VERSION_JS_PATH = "assets/js/version.js"
if not os.path.exists(VERSION_JS_PATH):
    print(f"Error: {VERSION_JS_PATH} not found.")
    exit(1)

with open(VERSION_JS_PATH, "r", encoding="utf-8") as f:
    version_js_content = f.read()

web_ver_match = re.search(r'webVersion\s*:\s*"([^"]+)"', version_js_content)
desktop_ver_match = re.search(r'desktopVersion\s*:\s*"([^"]+)"', version_js_content)
asset_ver_match = re.search(r'assetVersion\s*:\s*"([^"]+)"', version_js_content)

if not (web_ver_match and desktop_ver_match and asset_ver_match):
    print("Error: Failed to parse version info from version.js.")
    exit(1)

web_version = web_ver_match.group(1)
desktop_version = desktop_ver_match.group(1)
asset_version = asset_ver_match.group(1)

# Helper function to compute SHA-256
def get_sha256(filepath):
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

# Helper function to count unique lessons in a pack file
def get_lesson_count(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    keys = re.findall(r'window\.CONTENT_I18N\["([^"]+)"\]', content)
    return len(set(keys))

# Generate Asset Manifest
assets_to_cover = [
    "assets/js/version.js",
    "assets/js/app.js",
    "assets/js/i18n.js",
    "assets/js/content-i18n.js",
    "assets/js/i18n-ui-dict.js",
    "assets/js/glossary.js",
    "assets/js/code-runner-api.js",
    "data/lessons.js",
    "assets/css/index.css",
    "assets/css/glossary.css",
    "assets/images/og-study-tools-v2026-6-11.png",
    "manifest.webmanifest",
    "service-worker.js"
]

asset_items = []
for rel_path in assets_to_cover:
    if not os.path.exists(rel_path):
        print(f"Error: Covered asset {rel_path} does not exist.")
        exit(1)
    
    size_bytes = os.path.getsize(rel_path)
    sha256 = get_sha256(rel_path)
    
    ext = os.path.splitext(rel_path)[1].lower()
    if ext == ".js":
        file_type = "javascript"
    elif ext == ".css":
        file_type = "css"
    elif ext in [".png", ".jpg", ".jpeg", ".ico"]:
        file_type = "image"
    elif ext == ".webmanifest":
        file_type = "webmanifest"
    else:
        file_type = "unknown"
        
    # Determine cache strategy
    if rel_path in ["manifest.webmanifest", "service-worker.js"]:
        strategy = "pwa"
    elif rel_path == "assets/images/og-study-tools-v2026-6-11.png":
        strategy = "seo"
    else:
        strategy = "static"
        
    asset_items.append({
        "path": rel_path,
        "type": file_type,
        "version": asset_version,
        "sizeBytes": size_bytes,
        "sha256": sha256,
        "cacheStrategy": strategy
    })

asset_manifest = {
    "assetVersion": asset_version,
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "webVersion": web_version,
    "releaseVersion": web_version,
    "assets": asset_items
}

# Write asset manifest
os.makedirs("assets", exist_ok=True)
with open("assets/asset-manifest.json", "w", encoding="utf-8") as f:
    json.dump(asset_manifest, f, indent=2, ensure_ascii=False)
print("Successfully generated assets/asset-manifest.json")

# Generate Content Pack Manifest
content_dir = "data/i18n_content"
subjects = ["sql", "itpass", "sg", "java", "python"]
pack_pattern = re.compile(r"^(" + "|".join(subjects) + r")_([a-z]{2})\.js$")
pack_files = []
languages = set()

for filename in sorted(os.listdir(content_dir)):
    match = pack_pattern.match(filename)
    if not match:
        continue
    subj, lang = match.groups()
    pack_files.append((subj, lang, filename))
    languages.add(lang)

pack_items = []
total_packs = 0

for subj, lang, filename in pack_files:
    filepath = os.path.join(content_dir, filename)
    size_bytes = os.path.getsize(filepath)
    sha256 = get_sha256(filepath)
    lesson_count = get_lesson_count(filepath)

    if lang == "en":
        source_type = "manual"
    elif lang == "ko":
        source_type = "local-usable"
    else:
        source_type = "ai-assisted"

    item = {
        "subject": subj,
        "lang": lang,
        "path": filepath.replace("\\", "/"),
        "version": asset_version,
        "lessonCount": lesson_count,
        "sizeBytes": size_bytes,
        "sha256": sha256,
        "sourceType": source_type
    }
    if lang in ["ko", "my", "vi", "th"]:
        item["coverageStatus"] = f"usable-{lang}" if lang != "th" else "needs-review-th"
    pack_items.append(item)
    total_packs += 1

content_manifest = {
    "assetVersion": asset_version,
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "webVersion": web_version,
    "releaseVersion": web_version,
    "totalSubjects": len(subjects),
    "totalLanguages": len(languages),
    "totalPacks": total_packs,
    "packs": pack_items
}

os.makedirs(content_dir, exist_ok=True)
with open(os.path.join(content_dir, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(content_manifest, f, indent=2, ensure_ascii=False)
print("Successfully generated data/i18n_content/manifest.json")
