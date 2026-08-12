"""解析书签文件（支持 Netscape HTML、XBEL XML 和 TXT 格式）"""
import re
import unicodedata
import xml.etree.ElementTree as ET
from html import unescape
from typing import List, Dict
from pypinyin import lazy_pinyin, Style


def _sort_key_char(ch: str) -> tuple:
    """单字符排序键：数字 < 字母 < 汉字 < 其他"""
    if ch.isdigit():
        return (0, ch)
    if ch.isascii() and ch.isalpha():
        return (1, ch.lower())
    if '\u4e00' <= ch <= '\u9fff':
        return (2, ch)
    return (3, ch)


def _category_sort_key(category: str) -> tuple:
    """分类路径排序键：先按层级，再按数字/字母/汉字顺序"""
    depth = category.count(" / ")
    # 拆分每段路径，逐字符生成排序键
    parts = category.split(" / ")
    char_keys = tuple(
        tuple(_sort_key_char(ch) for ch in part)
        for part in parts
    )
    return (depth, char_keys)


def parse_bookmarks(file_path: str) -> List[Dict]:
    """解析书签文件，返回分类书签列表

    自动检测文件格式：Netscape HTML、XBEL XML 或 TXT

    Returns:
        [{"category": "视频", "items": [{"title": "...", "url": "..."}]}]
    """
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # 检测格式：包含 <xbel 标签则走 XBEL 解析，HTML 标签走 Netscape 解析，否则走 TXT 解析
    low = content[:2000].lower()
    if "<xbel" in low:
        return _parse_xbel(content)
    if "<dl>" in low or "<h3" in low or "<a " in low:
        return _parse_netscape_html(content)
    return _parse_txt(content, file_path)


def _parse_txt(content: str, file_path: str = "") -> List[Dict]:
    """解析 TXT 格式书签文件

    文件名作为目录名，排除 # 开头的行（注释），其余行为书签条目：
    - 以空格分隔，最后一位为 URL，前面的都是书签名
    - 书签名中的空格以 _ 替换

    Returns:
        [{"category": "工具", "items": [{"title": "...", "url": "..."}]}]
    """
    import os

    # 文件名（去扩展名）作为目录名
    category = os.path.splitext(os.path.basename(file_path))[0] if file_path else "未命名"

    items = []
    for line in content.splitlines():
        line = line.strip()
        # 排除空行和 # 开头的注释行
        if not line or line.startswith('#'):
            continue
        # 以空格分隔，最后一位为 URL
        parts = line.split()
        if len(parts) < 2:
            continue
        url = parts[-1]
        # 前面的部分为书签名，空格以 _ 替换
        title = '_'.join(parts[:-1])
        if not url.startswith('http://') and not url.startswith('https://') and not url.startswith('ftp://'):
            continue
        items.append({"title": title, "url": url})

    if not items:
        return []

    return [{"category": category, "items": items}]


def _parse_xbel(content: str) -> List[Dict]:
    """解析 XBEL XML 格式书签文件"""
    result = []
    root_bookmarks = []

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        # 尝试去掉 XML 声明再解析
        content_cleaned = re.sub(r'^<\?xml[^?]*\?>', '', content, count=1).strip()
        try:
            root = ET.fromstring(content_cleaned)
        except ET.ParseError:
            return []

    def parse_folder(elem, path_stack):
        items = []
        for child in elem:
            tag = child.tag
            # 只取标签名，忽略命名空间
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
                new_stack = path_stack + [folder_name]
                parse_folder(child, new_stack)

            elif tag == "separator":
                continue

        if items and path_stack:
            result.append({
                "category": " / ".join(path_stack),
                "items": items
            })
        elif items and not path_stack:
            root_bookmarks.extend(items)

    # XBEL 根节点下的顶层 folder/bookmark
    parse_folder(root, [])

    # 合并重复分类
    merged = {}
    for cat in result:
        key = cat["category"]
        if key in merged:
            merged[key]["items"].extend(cat["items"])
        else:
            merged[key] = cat
    result = list(merged.values())

    # 补齐缺失的父级目录
    all_paths = set()
    for cat in result:
        parts = cat["category"].split(" / ")
        for i in range(1, len(parts) + 1):
            all_paths.add(" / ".join(parts[:i]))
    existing = {cat["category"] for cat in result}
    for path in all_paths - existing:
        result.append({"category": path, "items": []})

    # 排序
    result.sort(key=lambda cat: _category_sort_key(cat["category"]))

    if root_bookmarks:
        result.append({"category": "__root_bookmarks__", "items": root_bookmarks})

    return result


def _parse_netscape_html(content: str) -> List[Dict]:
    """解析 Netscape Bookmark HTML 格式文件"""
    result = []
    category_stack = []
    # 匹配 <DT><H3...>分类名</H3> 和 <DT><A ...HREF="url"...>标题</A>
    h3_pattern = re.compile(r'<DT><H3[^>]*>(.*?)</H3>', re.IGNORECASE)
    # HREF 不要求是第一个属性，兼容属性顺序不同的格式
    a_pattern = re.compile(r'<DT><A\s+[^>]*?HREF="([^"]+)"[^>]*>(.*?)</A>', re.IGNORECASE)
    dl_open_pattern = re.compile(r'<DL>', re.IGNORECASE)
    dl_close_pattern = re.compile(r'</DL>', re.IGNORECASE)

    pos = 0
    current_items = []
    root_bookmarks = []

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
                result.append({
                    "category": " / ".join(category_stack),
                    "items": current_items
                })
                current_items = []
            category_name = unescape(match.group(1).strip())
            category_stack.append(category_name)
            pos = match.end()

        elif tag_type == 'dl_open':
            pos = match.end()

        elif tag_type == 'dl_close':
            if current_items and category_stack:
                result.append({
                    "category": " / ".join(category_stack),
                    "items": current_items
                })
                current_items = []
            if category_stack:
                category_stack.pop()
            pos = match.end()

        elif tag_type == 'a':
            url = unescape(match.group(1).strip())
            title = unescape(match.group(2).strip())
            if not category_stack:
                root_bookmarks.append({"title": title, "url": url})
            else:
                current_items.append({"title": title, "url": url})
            pos = match.end()

    if current_items and category_stack:
        result.append({
            "category": " / ".join(category_stack),
            "items": current_items
        })

    # 合并重复分类
    merged = {}
    for cat in result:
        key = cat["category"]
        if key in merged:
            merged[key]["items"].extend(cat["items"])
        else:
            merged[key] = cat
    result = list(merged.values())

    # 补齐缺失的父级目录
    all_paths = set()
    for cat in result:
        parts = cat["category"].split(" / ")
        for i in range(1, len(parts) + 1):
            all_paths.add(" / ".join(parts[:i]))
    existing = {cat["category"] for cat in result}
    for path in all_paths - existing:
        result.append({"category": path, "items": []})

    result.sort(key=lambda cat: _category_sort_key(cat["category"]))

    if root_bookmarks:
        result.append({"category": "__root_bookmarks__", "items": root_bookmarks})

    return result


_pinyin_cache = {}


def _get_pinyin_keys(text: str) -> tuple:
    """获取文本的全拼和首字母（缓存优化）"""
    if text in _pinyin_cache:
        return _pinyin_cache[text]
    full = ''.join(lazy_pinyin(text))
    initial = ''.join(lazy_pinyin(text, style=Style.FIRST_LETTER))
    result = (full.lower(), initial.lower())
    _pinyin_cache[text] = result
    return result


def search_bookmarks(categories: List[Dict], keyword: str) -> List[Dict]:
    """全局搜索书签，匹配标题（含拼音/首字母）、URL"""
    keyword = keyword.lower().strip()
    if not keyword:
        return categories

    result = []
    for cat in categories:
        matched_items = []
        for item in cat["items"]:
            title = item["title"]
            url = item["url"].lower()
            if keyword in title.lower() or keyword in url:
                matched_items.append(item)
                continue
            full_py, initial_py = _get_pinyin_keys(title)
            if keyword in full_py or keyword in initial_py:
                matched_items.append(item)
        if matched_items:
            result.append({
                "category": cat["category"],
                "items": matched_items
            })
    return result
