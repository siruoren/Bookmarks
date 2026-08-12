#!/usr/bin/env python3
"""
将书签文件（XBEL / Netscape HTML）按目录结构拆分为 txt 文件。

在 bookmarks/ 目录下创建以目录名命名的 txt 文件，
每个文件中写入该目录下的书签条目。

用法:
    python3 xbel_to_txt.py <输入文件> [输出目录]

示例:
    python3 xbel_to_txt.py data/repo/bookmarks.xbel data/repo/bookmarks
    python3 xbel_to_txt.py data/repo/bookmarks.html data/repo/bookmarks
"""
import os
import re
import sys
import xml.etree.ElementTree as ET
from html import unescape


def detect_format(file_path: str):
    """检测文件格式: xbel / html"""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        head = f.read(4096).lower()
    if "<xbel" in head:
        return "xbel"
    if "<html" in head or "<!doctype" in head:
        return "html"
    return "unknown"


def parse_xbel(file_path: str):
    """解析 XBEL 文件，返回 [(目录名, [{title, url}])]"""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        content_cleaned = re.sub(r'^<\?xml[^?]*\?>', '', content, count=1).strip()
        root = ET.fromstring(content_cleaned)

    result = []

    def parse_folder(elem, path_stack):
        items = []
        for child in elem:
            tag = child.tag
            if "}" in tag:
                tag = tag.split("}", 1)[1]

            if tag == "bookmark":
                href = child.get("href", "")
                title_elem = child.find("title")
                title = title_elem.text.strip() if title_elem is not None and title_elem.text else href
                if href:
                    items.append({"title": title, "url": href})

            elif tag == "folder":
                title_elem = child.find("title")
                folder_name = title_elem.text.strip() if title_elem is not None and title_elem.text else "未命名"
                parse_folder(child, path_stack + [folder_name])

            elif tag == "separator":
                continue

        if items and path_stack:
            result.append((" / ".join(path_stack), items))

    parse_folder(root, [])
    return result


def parse_html(file_path: str):
    """解析 Netscape Bookmark HTML 文件，返回 [(目录名, [{title, url}])]"""
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    result = []
    category_stack = []
    h3_pattern = re.compile(r'<DT><H3[^>]*>(.*?)</H3>', re.IGNORECASE)
    a_pattern = re.compile(r'<DT><A\s+[^>]*?HREF="([^"]+)"[^>]*>(.*?)</A>', re.IGNORECASE)
    dl_open_pattern = re.compile(r'<DL>', re.IGNORECASE)
    dl_close_pattern = re.compile(r'</DL>', re.IGNORECASE)

    pos = 0
    current_items = []

    while pos < len(content):
        next_h3 = h3_pattern.search(content, pos)
        next_a = a_pattern.search(content, pos)
        next_dl_open = dl_open_pattern.search(content, pos)
        next_dl_close = dl_close_pattern.search(content, pos)

        candidates = []
        if next_h3:
            candidates.append((next_h3.start(), 'h3', next_h3))
        if next_a:
            candidates.append((next_a.start(), 'a', next_a))
        if next_dl_open:
            candidates.append((next_dl_open.start(), 'dl_open', next_dl_open))
        if next_dl_close:
            candidates.append((next_dl_close.start(), 'dl_close', next_dl_close))

        if not candidates:
            break

        candidates.sort(key=lambda x: x[0])
        _, tag_type, match = candidates[0]

        if tag_type == 'h3':
            if current_items and category_stack:
                result.append((" / ".join(category_stack), current_items))
                current_items = []
            category_stack.append(unescape(match.group(1).strip()))
            pos = match.end()

        elif tag_type == 'dl_open':
            pos = match.end()

        elif tag_type == 'dl_close':
            if current_items and category_stack:
                result.append((" / ".join(category_stack), current_items))
                current_items = []
            if category_stack:
                category_stack.pop()
            pos = match.end()

        elif tag_type == 'a':
            href = match.group(1)
            title = unescape(match.group(2).strip())
            current_items.append({"title": title, "url": href})
            pos = match.end()

    if current_items and category_stack:
        result.append((" / ".join(category_stack), current_items))

    return result


def write_txt_files(categories, output_dir: str):
    """将分类书签写入 txt 文件"""
    os.makedirs(output_dir, exist_ok=True)
    written = 0

    for category, items in categories:
        folder_name = category.split(" / ")[-1]
        txt_path = os.path.join(output_dir, f"{folder_name}.txt")

        lines = []
        for item in items:
            title = item["title"].replace(" ", "_")
            url = item["url"]
            lines.append(f"{title} {url}")

        content = "\n".join(lines) + "\n"

        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"  {txt_path} ({len(items)} 条)")
        written += 1

    return written


def main():
    if len(sys.argv) < 2:
        print("用法: python3 xbel_to_txt.py <输入文件> [输出目录]")
        print("支持格式: XBEL (.xbel) / Netscape HTML (.html)")
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "bookmarks"

    if not os.path.isfile(input_path):
        print(f"错误: 文件不存在: {input_path}")
        sys.exit(1)

    fmt = detect_format(input_path)
    if fmt == "xbel":
        print(f"解析 XBEL: {input_path}")
        categories = parse_xbel(input_path)
    elif fmt == "html":
        print(f"解析 HTML: {input_path}")
        categories = parse_html(input_path)
    else:
        print(f"错误: 无法识别文件格式（仅支持 XBEL 和 Netscape HTML）")
        sys.exit(1)

    print(f"发现 {len(categories)} 个目录")

    print(f"输出: {output_dir}/")
    written = write_txt_files(categories, output_dir)
    print(f"完成: 已生成 {written} 个 txt 文件")


if __name__ == "__main__":
    main()
