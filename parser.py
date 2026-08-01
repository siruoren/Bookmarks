"""解析Netscape Bookmark HTML文件"""
import re
from html import unescape
from typing import List, Dict


def parse_bookmarks(file_path: str) -> List[Dict]:
    """解析书签文件，返回分类书签列表

    Returns:
        [{"category": "视频", "items": [{"title": "...", "url": "..."}]}]
    """
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    result = []
    # 用栈跟踪当前层级分类名
    category_stack = []
    # 匹配 <DT><H3...>分类名</H3> 和 <DT><A HREF="url"...>标题</A>
    h3_pattern = re.compile(r'<DT><H3[^>]*>(.*?)</H3>', re.IGNORECASE)
    a_pattern = re.compile(r'<DT><A\s+HREF="([^"]+)"[^>]*>(.*?)</A>', re.IGNORECASE)
    dl_open_pattern = re.compile(r'<DL>', re.IGNORECASE)
    dl_close_pattern = re.compile(r'</DL>', re.IGNORECASE)

    pos = 0
    # 当前分类下的书签暂存
    current_items = []
    # 根目录下的书签（用于展平显示）
    root_bookmarks = []
    
    # 需要跳过的根目录名（只跳过 Other Bookmarks，保留 Bookmarks Bar）
    skip_root_categories = {""}

    while pos < len(content):
        # 查找下一个关键标签
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
            # 保存之前分类的书签
            if current_items and category_stack:
                result.append({
                    "category": " / ".join(category_stack),
                    "items": current_items
                })
                current_items = []
            category_name = unescape(match.group(1).strip())
            
            # 检查是否是需要跳过的根目录
            if len(category_stack) == 0 and category_name in skip_root_categories:
                # 跳过这个根目录名，但不阻止其子分类和书签被处理
                category_stack.append(category_name)
            else:
                category_stack.append(category_name)
            pos = match.end()

        elif tag_type == 'dl_open':
            pos = match.end()

        elif tag_type == 'dl_close':
            # 保存当前分类书签
            if current_items and category_stack:
                # 如果是根目录且在跳过列表中，将书签添加到根书签列表
                if len(category_stack) == 1 and category_stack[0] in skip_root_categories:
                    root_bookmarks.extend(current_items)
                else:
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
            
            # 如果在根目录下（没有分类），添加到根书签列表
            if not category_stack:
                root_bookmarks.append({"title": title, "url": url})
            else:
                current_items.append({"title": title, "url": url})
            pos = match.end()

    # 处理末尾残留
    if current_items and category_stack:
        if len(category_stack) == 1 and category_stack[0] in skip_root_categories:
            root_bookmarks.extend(current_items)
        else:
            result.append({
                "category": " / ".join(category_stack),
                "items": current_items
            })

    # 合并重复的分类路径
    merged_result = {}
    for cat in result:
        category_path = cat["category"]
        if category_path in merged_result:
            # 合并书签项
            merged_result[category_path]["items"].extend(cat["items"])
        else:
            merged_result[category_path] = cat
    
    # 转换回列表格式
    result = list(merged_result.values())

    # 按目录层级升序排序，同层级下按名称排序
    result.sort(key=lambda cat: (cat["category"].count(" / "), cat["category"]))

    # 将根目录书签作为特殊字段添加到结果中
    if root_bookmarks:
        result.append({
            "category": "__root_bookmarks__",
            "items": root_bookmarks
        })

    return result


def flatten_bookmarks(categories: List[Dict]) -> List[Dict]:
    """将分类书签展平为单一列表"""
    items = []
    for cat in categories:
        for item in cat["items"]:
            items.append({
                "title": item["title"],
                "url": item["url"],
                "category": cat["category"]
            })
    return items


def search_bookmarks(categories: List[Dict], keyword: str) -> List[Dict]:
    """全局搜索书签，匹配标题或URL"""
    keyword = keyword.lower().strip()
    if not keyword:
        return categories

    result = []
    for cat in categories:
        matched_items = []
        for item in cat["items"]:
            if keyword in item["title"].lower() or keyword in item["url"].lower():
                matched_items.append(item)
        if matched_items:
            result.append({
                "category": cat["category"],
                "items": matched_items
            })
    return result
