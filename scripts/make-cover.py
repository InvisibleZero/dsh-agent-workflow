"""生成插件封面（1200x800）。

左侧：与插件一致的侧栏树，三层结构（工作区 → 子节点 → 孙节点）。
右侧：说明「同一节点、不同状态 → 注入的上下文不一样」。

改文案/改树后重跑本脚本即可覆盖 assets/cover.png。
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 800
BG_TOP = (13, 17, 23)
BG_BOTTOM = (26, 34, 48)
ACCENT = (77, 123, 253)
TEXT_PRIMARY = (240, 244, 251)
TEXT_SECONDARY = (147, 164, 191)
TEXT_MUTED = (127, 142, 166)

PANEL_BG = (18, 22, 29)
PANEL_BORDER = (42, 49, 62)
ROW_SELECTED = (30, 36, 48)
ROW_TITLE = (232, 238, 247)
ROW_CHILD_TITLE = (186, 196, 212)
STATE_IDLE = (110, 120, 136)
STATE_WARN = (214, 160, 72)
STATE_BRAND = (95, 138, 255)
STATE_SUCCESS = (63, 185, 80)

CODE_BG = (15, 19, 25)
CODE_BORDER = (44, 52, 66)
CHIP_INACTIVE = (30, 36, 48)

FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
OUT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\dsh-agent-workflow\assets\cover.png"


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


def draw_tree_panel(canvas, x0, y0, w, h):
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)

    header_font = ImageFont.truetype(FONT_REG, 15)
    row_font = ImageFont.truetype(FONT_REG, 17)
    state_font = ImageFont.truetype(FONT_REG, 13)

    d.text((16, 16), "工作区", font=header_font, fill=TEXT_MUTED)
    draw_search(d, w - 104, 17, STATE_IDLE)
    draw_sliders(d, w - 72, 16, STATE_IDLE)
    draw_folder_plus(d, w - 42, 15, STATE_IDLE)

    rows = [
        (0, "电商系统改造", "讨论中", STATE_WARN, False, True),
        (1, "登录模块", "实现中", STATE_BRAND, False, True),
        (2, "接口字段设计", "已完结", STATE_SUCCESS, False, False),
        (2, "表单校验重构", "实现中", STATE_BRAND, True, False),
        (1, "订单状态机", "未开始", STATE_IDLE, False, False),
        (1, "支付回调加固", "未开始", STATE_IDLE, False, False),
    ]

    y = 54
    for depth, title, state, color, selected, expanded in rows:
        if selected:
            d.rounded_rectangle([(10, y - 6), (w - 10, y + 34)], radius=7, fill=ROW_SELECTED)
        text_x = 16 + depth * 20
        if depth == 0:
            if expanded:
                d.polygon([(text_x + 1, y + 8), (text_x + 9, y + 8), (text_x + 5, y + 14)], fill=TEXT_MUTED)
            else:
                d.polygon([(text_x + 2, y + 6), (text_x + 8, y + 11), (text_x + 2, y + 16)], fill=TEXT_MUTED)
            fx = text_x + 14
            d.line([(fx, y + 6), (fx + 8, y + 6), (fx + 10, y + 9), (fx + 15, y + 9)], fill=ACCENT, width=2)
            d.line([(fx, y + 6), (fx, y + 17), (fx + 15, y + 17), (fx + 15, y + 9)], fill=ACCENT, width=2)
            d.text((text_x + 40, y + 2), title, font=row_font, fill=ROW_TITLE)
        elif depth == 1:
            if expanded:
                d.polygon([(text_x + 1, y + 8), (text_x + 9, y + 8), (text_x + 5, y + 14)], fill=TEXT_MUTED)
            else:
                d.polygon([(text_x + 2, y + 6), (text_x + 8, y + 11), (text_x + 2, y + 16)], fill=TEXT_MUTED)
            d.text((text_x + 20, y + 2), title, font=row_font, fill=ROW_TITLE)
        else:
            d.ellipse([(text_x + 4, y + 7), (text_x + 12, y + 15)], fill=color if selected else STATE_IDLE)
            d.text((text_x + 22, y + 2), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        tw = d.textlength(state, font=state_font)
        d.text((w - 16 - tw, y + 4), state, font=state_font, fill=color)
        y += 46

    canvas.paste(panel, (x0, y0), panel)


def draw_context_panel(canvas, x0, y0, w, h):
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)

    title_font = ImageFont.truetype(FONT_BOLD, 20)
    node_font = ImageFont.truetype(FONT_REG, 15)
    chip_font = ImageFont.truetype(FONT_REG, 15)
    code_font = ImageFont.truetype(FONT_REG, 15)
    dim_font = ImageFont.truetype(FONT_REG, 13)

    d.text((20, 20), "状态决定注入的上下文", font=title_font, fill=TEXT_PRIMARY)
    d.text((20, 56), "节点：表单校验重构", font=node_font, fill=TEXT_MUTED)

    # 两个状态 chip：实现中 = 高亮
    d.rounded_rectangle([(20, 88), (116, 122)], radius=9, fill=CHIP_INACTIVE, outline=PANEL_BORDER, width=1)
    d.text((38, 91), "讨论中", font=chip_font, fill=TEXT_MUTED)
    d.rounded_rectangle([(132, 88), (228, 122)], radius=9, fill=ACCENT)
    d.text((150, 91), "实现中", font=chip_font, fill=(255, 255, 255))

    # 注入块
    cb_x, cb_y = 20, 142
    cb_w, cb_h = w - 40, 168
    d.rounded_rectangle([(cb_x, cb_y), (cb_x + cb_w - 1, cb_y + cb_h - 1)], radius=10, fill=CODE_BG, outline=CODE_BORDER, width=1)
    lines = [
        "本阶段按已确认的方案落地。",
        "先读后改：只改相关文件，改动越少越好。",
        "完成后给出验证方式与通过标准。",
    ]
    ly = cb_y + 16
    for line in lines:
        d.text((cb_x + 16, ly), line, font=code_font, fill=ROW_CHILD_TITLE)
        ly += 28
    d.text((cb_x + 16, ly + 4), "↳ 这些会进这个会话的系统上下文", font=dim_font, fill=TEXT_MUTED)

    # 对比：讨论中会注入什么
    d.text((20, 330), "同一个节点，切到「讨论中」则注入：", font=dim_font, fill=TEXT_MUTED)
    d.rounded_rectangle([(20, 356), (w - 20, 392)], radius=9, fill=CODE_BG, outline=CODE_BORDER, width=1)
    d.text((36, 364), "只讨论不动手：给方案、取舍与待确认点。", font=code_font, fill=STATE_WARN)

    canvas.paste(panel, (x0, y0), panel)


canvas = gradient_canvas()

# 品牌方块
brand = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
bd = ImageDraw.Draw(brand)
bd.rounded_rectangle([(0, 0), (63, 63)], radius=16, fill=ACCENT)
bd.line([(20, 24), (44, 24)], fill=(255, 255, 255), width=3)
bd.line([(20, 32), (44, 32)], fill=(255, 255, 255), width=3)
bd.line([(20, 40), (36, 40)], fill=(255, 255, 255), width=3)
canvas.paste(brand, (72, 64), brand)

title_font = ImageFont.truetype(FONT_BOLD, 46)
sub_font = ImageFont.truetype(FONT_REG, 24)
meta_font = ImageFont.truetype(FONT_REG, 19)
draw = ImageDraw.Draw(canvas)
draw.text((72, 156), "dsh-agent-workflow", font=title_font, fill=TEXT_PRIMARY)
draw.text((72, 222), "Agent 编排与 Workflow 状态机", font=sub_font, fill=TEXT_SECONDARY)
draw.text((72, 262), "DeepSeek Harness 插件 · v0.2.0", font=meta_font, fill=TEXT_MUTED)

draw_tree_panel(canvas, 64, 320, 470, 430)
draw_context_panel(canvas, 580, 320, 556, 430)

canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)
