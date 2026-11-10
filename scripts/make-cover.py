"""生成插件封面（1200x800）——扁平模型版。

左：一个工作区（项目）下的**会话列表**（每个会话 = 一个 workflow 单元，不再有树）。
右：状态机 + 两层手册（项目手册 / 会话手册）。

改文案后重跑本脚本即可覆盖 assets/cover.png。
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


def draw_arrow(d, x, y, color):
    d.line([(x, y), (x + 9, y)], fill=color, width=2)
    d.polygon([(x + 9, y - 4), (x + 14, y), (x + 9, y + 4)], fill=color)


def draw_sessions_panel(canvas, x0, y0, w, h):
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)

    header_font = ImageFont.truetype(FONT_REG, 15)
    title_font = ImageFont.truetype(FONT_BOLD, 17)
    row_font = ImageFont.truetype(FONT_REG, 17)
    state_font = ImageFont.truetype(FONT_REG, 13)
    note_font = ImageFont.truetype(FONT_REG, 13)

    d.text((18, 16), "工作区", font=header_font, fill=TEXT_MUTED)
    d.text((18, 42), "电商系统改造", font=title_font, fill=TEXT_PRIMARY)

    rows = [
        ("登录模块", "实现中", STATE_BRAND, True),
        ("支付回调加固", "已完结", STATE_SUCCESS, False),
        ("订单状态机", "讨论中", STATE_WARN, False),
        ("退货流程", "未开始", STATE_IDLE, False),
        ("发票系统", "未开始", STATE_IDLE, False),
    ]

    y = 88
    for title, state, color, selected in rows:
        if selected:
            d.rounded_rectangle([(10, y - 6), (w - 10, y + 34)], radius=7, fill=ROW_SELECTED)
        d.ellipse([(20, y + 7), (28, y + 15)], fill=color)
        d.text((38, y + 2), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        tw = d.textlength(state, font=state_font)
        d.text((w - 18 - tw, y + 4), state, font=state_font, fill=color)
        y += 52

    d.text((18, h - 40), "每个会话 = 一个 workflow 单元", font=note_font, fill=TEXT_MUTED)

    canvas.paste(panel, (x0, y0), panel)


def draw_flow_panel(canvas, x0, y0, w, h):
    panel = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (w - 1, h - 1)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)

    title_font = ImageFont.truetype(FONT_BOLD, 20)
    label_font = ImageFont.truetype(FONT_REG, 14)
    pill_font = ImageFont.truetype(FONT_REG, 12)
    code_font = ImageFont.truetype(FONT_REG, 14)
    file_font = ImageFont.truetype(FONT_REG, 15)
    dim_font = ImageFont.truetype(FONT_REG, 12)

    d.text((20, 16), "状态机 + 两层手册", font=title_font, fill=TEXT_PRIMARY)

    # 五态流程
    d.text((20, 52), "每个会话走五态状态机", font=label_font, fill=TEXT_MUTED)
    states = [
        ("未开始", STATE_IDLE, False),
        ("讨论中", STATE_WARN, False),
        ("实现中", STATE_BRAND, True),
        ("验收中", STATE_WARN, False),
        ("已完结", STATE_SUCCESS, False),
    ]
    pill_w, pill_h = 86, 30
    x = 20
    y = 78
    for index, (label, color, active) in enumerate(states):
        fill = (40, 52, 84) if active else CODE_BG
        outline = color if active else CODE_BORDER
        d.rounded_rectangle([(x, y), (x + pill_w, y + pill_h)], radius=8, fill=fill, outline=outline, width=1)
        tw = d.textlength(label, font=pill_font)
        d.text((x + (pill_w - tw) / 2, y + 7), label, font=pill_font, fill=(255, 255, 255) if active else color)
        x += pill_w
        if index < len(states) - 1:
            draw_arrow(d, x + 6, y + pill_h // 2, STATE_IDLE)
            x += 26

    # 注入块
    d.text((20, 132), "当前状态决定注入什么", font=label_font, fill=TEXT_MUTED)
    box_top, box_h = 156, 96
    d.rounded_rectangle([(20, box_top), (w - 20, box_top + box_h)], radius=9, fill=CODE_BG, outline=CODE_BORDER, width=1)
    lines = [
        "A 公共 + 当前状态的操作细节",
        "会话手册（方案 + 实施顺序）",
        "项目手册（总览 / 决策 / 要点）",
    ]
    ly = box_top + 14
    for line in lines:
        d.text((38, ly), line, font=code_font, fill=ROW_CHILD_TITLE)
        ly += 24

    # 两层手册
    d.text((20, 276), "两层手册（AI 自留）", font=label_font, fill=TEXT_MUTED)
    files = [
        ("项目手册.md", "总览 / 决策 / 要点 · 跨会话共享"),
        ("会话手册-<id>.md", "方案（5 层）+ 实施顺序 · 每会话一份"),
    ]
    fy = 302
    for name, desc in files:
        d.rounded_rectangle([(20, fy), (w - 20, fy + 58)], radius=9, fill=CODE_BG, outline=CODE_BORDER, width=1)
        # 文件图标
        fx, fyy = 38, fy + 16
        d.line([(fx, fyy), (fx + 10, fyy), (fx + 13, fyy + 3), (fx + 18, fyy + 3)], fill=ACCENT, width=2)
        d.line([(fx, fyy), (fx, fyy + 20), (fx + 18, fyy + 20), (fx + 18, fyy + 5)], fill=ACCENT, width=2)
        d.text((fx + 28, fy + 10), name, font=file_font, fill=TEXT_PRIMARY)
        d.text((fx + 28, fy + 34), desc, font=dim_font, fill=TEXT_MUTED)
        fy += 68

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

draw_sessions_panel(canvas, 64, 320, 470, 430)
draw_flow_panel(canvas, 580, 320, 556, 430)

canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)

