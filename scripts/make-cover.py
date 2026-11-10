"""生成插件封面：左侧标题+卖点，右侧绘制一块与插件一致的侧栏树（不贴真实截图）。

改文案/改树结构后直接重跑本脚本即可覆盖 assets/cover.png。
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (13, 17, 23)
BG_BOTTOM = (26, 34, 48)
ACCENT = (77, 123, 253)
TEXT_PRIMARY = (240, 244, 251)
TEXT_SECONDARY = (147, 164, 191)
TEXT_MUTED = (127, 142, 166)

# 面板配色（贴近插件实际界面）
PANEL_BG = (18, 22, 29)
PANEL_BORDER = (42, 49, 62)
ROW_SELECTED = (30, 36, 48)
ROW_TITLE = (232, 238, 247)
ROW_CHILD_TITLE = (186, 196, 212)
STATE_IDLE = (110, 120, 136)
STATE_WARN = (214, 160, 72)
STATE_BRAND = (95, 138, 255)
STATE_SUCCESS = (63, 185, 80)

FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
OUT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\dsh-agent-workflow\assets\cover.png"

CARD_W, CARD_H = 520, 276
CARD_X, CARD_Y = 628, 182


def gradient_canvas():
    canvas = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(canvas)
    for y in range(H):
        t = y / (H - 1)
        draw.line([(0, y), (W, y)], fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    return canvas


def draw_search(d, x, y, color):
    d.ellipse([(x, y), (x + 11, y + 11)], outline=color, width=2)
    d.line([(x + 10, y + 10), (x + 15, y + 15)], fill=color, width=2)


def draw_sliders(d, x, y, color):
    for i, dy in enumerate((0, 9)):
        d.line([(x, y + dy + 2), (x + 15, y + dy + 2)], fill=color, width=2)
        cx = x + 4 if i == 0 else x + 11
        d.ellipse([(cx - 3, y + dy - 1), (cx + 3, y + dy + 5)], fill=color)


def draw_folder_plus(d, x, y, color):
    d.line([(x, y + 3), (x + 9, y + 3), (x + 11, y + 6), (x + 16, y + 6)], fill=color, width=2)
    d.line([(x, y + 3), (x, y + 14), (x + 16, y + 14), (x + 16, y + 9)], fill=color, width=2)
    d.line([(x + 10, y + 8), (x + 10, y + 13)], fill=color, width=2)
    d.line([(x + 7.5, y + 10.5), (x + 12.5, y + 10.5)], fill=color, width=2)


def draw_tree_panel(canvas):
    panel = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (CARD_W - 1, CARD_H - 1)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)

    header_font = ImageFont.truetype(FONT_REG, 15)
    row_font = ImageFont.truetype(FONT_REG, 16)
    state_font = ImageFont.truetype(FONT_REG, 13)

    # 表头：工作区 + 右侧三个图标
    d.text((16, 16), "工作区", font=header_font, fill=TEXT_MUTED)
    draw_search(d, CARD_W - 106, 17, STATE_IDLE)
    draw_sliders(d, CARD_W - 74, 16, STATE_IDLE)
    draw_folder_plus(d, CARD_W - 44, 15, STATE_IDLE)

    rows = [
        # (层级, 标题, 状态文字, 颜色, 是否选中)
        (0, "登录模块改造", "讨论中", STATE_WARN, False),
        (1, "接口字段设计", "已完结", STATE_SUCCESS, False),
        (1, "表单校验重构", "实现中", STATE_BRAND, True),
        (1, "回归测试补齐", "未开始", STATE_IDLE, False),
        (0, "支付回调加固", "未开始", STATE_IDLE, False),
    ]

    y = 52
    for depth, title, state, color, selected in rows:
        if selected:
            d.rounded_rectangle([(10, y - 6), (CARD_W - 10, y + 30)], radius=7, fill=ROW_SELECTED)
        text_x = 16 + depth * 22
        if depth == 0:
            # 箭头（第一个工作区展开、第二个折叠）+ 文件夹
            if title == "支付回调加固":
                d.polygon([(text_x + 2, y + 5), (text_x + 8, y + 10), (text_x + 2, y + 15)], fill=TEXT_MUTED)
            else:
                d.polygon([(text_x + 1, y + 7), (text_x + 9, y + 7), (text_x + 5, y + 13)], fill=TEXT_MUTED)
            fx = text_x + 14
            d.line([(fx, y + 5), (fx + 8, y + 5), (fx + 10, y + 8), (fx + 15, y + 8)], fill=ACCENT, width=2)
            d.line([(fx, y + 5), (fx, y + 16), (fx + 15, y + 16), (fx + 15, y + 8)], fill=ACCENT, width=2)
            d.text((text_x + 40, y + 1), title, font=row_font, fill=ROW_TITLE)
        else:
            d.ellipse([(text_x + 2, y + 6), (text_x + 10, y + 14)], fill=color if selected else STATE_IDLE)
            d.text((text_x + 22, y + 1), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        # 右侧状态
        tw = d.textlength(state, font=state_font)
        d.text((CARD_W - 16 - tw, y + 3), state, font=state_font, fill=color)
        y += 40

    canvas.paste(panel, (CARD_X, CARD_Y), panel)

    # 外阴影
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    for i in range(8, 0, -1):
        sd.rounded_rectangle(
            [(CARD_X - i, CARD_Y - i), (CARD_X + CARD_W + i, CARD_Y + CARD_H + i)],
            radius=14 + i,
            outline=(0, 0, 0, 16),
            width=1,
        )
    return Image.alpha_composite(canvas.convert("RGBA"), shadow)


canvas = gradient_canvas()

# 品牌方块
brand = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
bd = ImageDraw.Draw(brand)
bd.rounded_rectangle([(0, 0), (63, 63)], radius=16, fill=ACCENT)
bd.line([(20, 24), (44, 24)], fill=(255, 255, 255), width=3)
bd.line([(20, 32), (44, 32)], fill=(255, 255, 255), width=3)
bd.line([(20, 40), (36, 40)], fill=(255, 255, 255), width=3)
canvas.paste(brand, (72, 84), brand)

title_font = ImageFont.truetype(FONT_BOLD, 44)
sub_font = ImageFont.truetype(FONT_REG, 24)
meta_font = ImageFont.truetype(FONT_REG, 19)
bullet_font = ImageFont.truetype(FONT_REG, 20)

draw = ImageDraw.Draw(canvas)
draw.text((72, 186), "dsh-agent-workflow", font=title_font, fill=TEXT_PRIMARY)
draw.text((72, 252), "Agent 编排与 Workflow 状态机", font=sub_font, fill=TEXT_SECONDARY)
draw.text((72, 292), "DeepSeek Harness 插件 · v0.2.0", font=meta_font, fill=TEXT_MUTED)

bullets = [
    "树形子节点，每个子节点即一个会话",
    "五态状态机，状态决定注入的上下文",
    "节点工作手册 + 上级摘要（AI 自留）",
]
y = 358
for text in bullets:
    draw.ellipse([(74, y + 8), (84, y + 18)], fill=ACCENT)
    draw.text((100, y), text, font=bullet_font, fill=TEXT_SECONDARY)
    y += 44

canvas = draw_tree_panel(canvas)
canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)



