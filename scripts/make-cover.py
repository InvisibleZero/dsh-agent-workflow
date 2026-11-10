"""生成一张横向三联封面（2100x780），每栏占 1/3 宽：

  1/3 会话列表（工作区 = 项目，会话 = 单元）
  1/3 五态状态机 + 状态决定注入什么
  1/3 两层手册（项目手册 / 会话手册）

每栏先在 700 宽的图层上用「本地坐标」画，再整体贴到画布上。
重跑本脚本即可覆盖 assets/cover.png。
"""

from PIL import Image, ImageDraw, ImageFont

COL_W = 700
COLS = 3
W, H = COL_W * COLS, 640
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

PANEL_TOP, PANEL_BOTTOM = 104, H - 16


def gradient():
    canvas = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(canvas)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    return canvas


def new_column():
    layer = Image.new("RGBA", (COL_W, H), (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer)


def draw_arrow(d, x, y, color, length=16):
    d.line([(x, y), (x + length - 6, y)], fill=color, width=2)
    d.polygon([(x + length - 7, y - 4), (x + length, y), (x + length - 7, y + 4)], fill=color)


def header(d, title, subtitle):
    title_font = ImageFont.truetype(FONT_BOLD, 26)
    sub_font = ImageFont.truetype(FONT_REG, 14)
    d.text((24, 34), title, font=title_font, fill=TEXT_PRIMARY)
    d.text((24, 72), subtitle, font=sub_font, fill=TEXT_SECONDARY)


def panel_box(d):
    d.rounded_rectangle([(16, PANEL_TOP), (COL_W - 16, PANEL_BOTTOM)], radius=16, fill=PANEL_BG, outline=PANEL_BORDER, width=1)


# ------------------------------------------------------------------ 第 1 栏
def build_sessions():
    layer, d = new_column()
    header(d, "工作区 = 项目，会话 = 单元", "打开任意会话，它自动成为 workflow 节点")
    panel_box(d)

    small = ImageFont.truetype(FONT_REG, 14)
    proj = ImageFont.truetype(FONT_BOLD, 21)
    row_font = ImageFont.truetype(FONT_REG, 18)
    state_font = ImageFont.truetype(FONT_REG, 13)
    note_font = ImageFont.truetype(FONT_REG, 13)

    d.text((44, PANEL_TOP + 22), "工作区", font=small, fill=TEXT_MUTED)
    d.text((44, PANEL_TOP + 46), "电商系统改造", font=proj, fill=TEXT_PRIMARY)

    rows = [
        ("登录模块", "实现中", STATE_BRAND, True),
        ("支付回调加固", "已完结", STATE_SUCCESS, False),
        ("订单状态机", "讨论中", STATE_WARN, False),
        ("退货流程", "未开始", STATE_IDLE, False),
        ("发票系统", "未开始", STATE_IDLE, False),
        ("用户中心", "未开始", STATE_IDLE, False),
    ]
    y = PANEL_TOP + 96
    for title, state, color, selected in rows:
        if selected:
            d.rounded_rectangle([(30, y - 7), (COL_W - 30, y + 35)], radius=8, fill=ROW_SELECTED)
        d.ellipse([(42, y + 7), (50, y + 15)], fill=color)
        d.text((62, y + 1), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        tw = d.textlength(state, font=state_font)
        d.text((COL_W - 46 - tw, y + 4), state, font=state_font, fill=color)
        y += 62

    d.text((44, PANEL_BOTTOM - 34), "每个会话 = 一个 workflow 单元", font=note_font, fill=TEXT_MUTED)
    return layer


# ------------------------------------------------------------------ 第 2 栏
def build_state():
    layer, d = new_column()
    header(d, "五态状态机", "每次推进，都把该状态的操作细节注入给模型")
    panel_box(d)

    small = ImageFont.truetype(FONT_REG, 14)
    pill_font = ImageFont.truetype(FONT_REG, 13)
    head_font = ImageFont.truetype(FONT_BOLD, 17)
    code_font = ImageFont.truetype(FONT_REG, 14)
    dim_font = ImageFont.truetype(FONT_REG, 13)

    d.text((44, PANEL_TOP + 22), "每个会话走五态状态机", font=small, fill=TEXT_MUTED)

    states = [
        ("未开始", STATE_IDLE, False),
        ("讨论中", STATE_WARN, False),
        ("实现中", STATE_BRAND, True),
        ("验收中", STATE_WARN, False),
        ("已完结", STATE_SUCCESS, False),
    ]
    pill_w, pill_h, gap = 114, 34, 20
    x, y = 44, PANEL_TOP + 48
    for index, (text, color, active) in enumerate(states):
        fill = (40, 52, 84) if active else CODE_BG
        outline = color if active else CODE_BORDER
        d.rounded_rectangle([(x, y), (x + pill_w, y + pill_h)], radius=9, fill=fill, outline=outline, width=1)
        tw = d.textlength(text, font=pill_font)
        d.text((x + (pill_w - tw) / 2, y + 8), text, font=pill_font, fill=(255, 255, 255) if active else color)
        x += pill_w
        if index < len(states) - 1:
            draw_arrow(d, x + 3, y + pill_h // 2, STATE_IDLE, 14)
            x += gap

    d.text((44, PANEL_TOP + 106), "当前状态决定注入什么", font=small, fill=TEXT_MUTED)

    d.text((44, PANEL_TOP + 132), "讨论中", font=head_font, fill=STATE_WARN)
    d.rounded_rectangle([(44, PANEL_TOP + 158), (COL_W - 44, PANEL_TOP + 158 + 58)], radius=10, fill=CODE_BG, outline=CODE_BORDER, width=1)
    d.text((62, PANEL_TOP + 174), "只讨论不动手：给方案、取舍与待确认点。", font=code_font, fill=ROW_CHILD_TITLE)

    d.text((44, PANEL_TOP + 236), "实现中", font=head_font, fill=STATE_BRAND)
    d.text((44 + d.textlength("实现中", font=head_font) + 12, PANEL_TOP + 238), "当前态", font=dim_font, fill=ACCENT)
    d.rounded_rectangle([(44, PANEL_TOP + 262), (COL_W - 44, PANEL_TOP + 262 + 116)], radius=10, fill=CODE_BG, outline=(58, 86, 150), width=1)
    lines = [
        "本阶段按已确认的方案落地。",
        "先读后改：只改相关文件，改动越少越好。",
        "完成后给出验证方式与通过标准。",
        "每完成一层，勾掉「实施顺序」里对应那条。",
    ]
    ly = PANEL_TOP + 278
    for line in lines:
        d.text((62, ly), line, font=code_font, fill=ROW_CHILD_TITLE)
        ly += 25

    d.text((44, PANEL_BOTTOM - 34), "可返工：实现中 → 讨论中；验收中 → 实现中 / 讨论中", font=dim_font, fill=TEXT_MUTED)
    return layer


# ------------------------------------------------------------------ 第 3 栏
def build_manual():
    layer, d = new_column()
    header(d, "两层手册（AI 自留）", "项目级记忆跨会话延续，会话级记忆各自独立")
    panel_box(d)

    file_font = ImageFont.truetype(FONT_BOLD, 16)
    desc_font = ImageFont.truetype(FONT_REG, 13)
    item_font = ImageFont.truetype(FONT_REG, 14)

    def file_icon(x, y):
        d.line([(x, y), (x + 11, y), (x + 14, y + 3), (x + 20, y + 3)], fill=ACCENT, width=2)
        d.line([(x, y), (x, y + 22), (x + 20, y + 22), (x + 20, y + 5)], fill=ACCENT, width=2)

    x0, x1 = 40, COL_W - 40

    # 项目手册
    d.rounded_rectangle([(x0, PANEL_TOP + 20), (x1, PANEL_TOP + 20 + 110)], radius=12, fill=CODE_BG, outline=CODE_BORDER, width=1)
    file_icon(x0 + 18, PANEL_TOP + 38)
    d.text((x0 + 52, PANEL_TOP + 34), "项目手册.md", font=file_font, fill=TEXT_PRIMARY)
    d.text((x0 + 52, PANEL_TOP + 60), "总览 / 决策 / 要点 · 跨会话共享", font=desc_font, fill=TEXT_MUTED)
    d.text((x0 + 18, PANEL_TOP + 96), "会话收尾时回写结论，是项目「当前状态」", font=item_font, fill=STATE_SUCCESS)

    # 会话手册
    box_top = PANEL_TOP + 146
    box_bottom = box_top + 268
    d.rounded_rectangle([(x0, box_top), (x1, box_bottom)], radius=12, fill=CODE_BG, outline=(58, 86, 150), width=1)
    file_icon(x0 + 18, box_top + 18)
    d.text((x0 + 52, box_top + 14), "会话手册-<node_id>.md", font=file_font, fill=TEXT_PRIMARY)
    d.text((x0 + 52, box_top + 40), "方案（5 层）+ 实施顺序 · 每会话一份", font=desc_font, fill=TEXT_MUTED)

    d.text((x0 + 18, box_top + 74), "## 方案（上层 → 下层）", font=item_font, fill=ROW_TITLE)
    layers = ["1. 目标与验收", "2. 对外契约", "3. 结构与依赖", "4. 数据与状态", "5. 表现与文案"]
    for i, line in enumerate(layers):
        d.text((x0 + 34 + (i % 2) * 280, box_top + 100 + (i // 2) * 26), line, font=item_font, fill=ROW_CHILD_TITLE)

    d.text((x0 + 18, box_top + 184), "## 实施顺序", font=item_font, fill=ROW_TITLE)
    checks = [("2. 对外契约", True), ("3. 结构与依赖", True), ("4. 数据与状态", False), ("5. 表现与文案", False)]
    for i, (label, done) in enumerate(checks):
        cx = x0 + 34 + (i % 2) * 280
        cy = box_top + 212 + (i // 2) * 28
        if done:
            d.line([(cx, cy + 6), (cx + 4, cy + 10)], fill=STATE_SUCCESS, width=2)
            d.line([(cx + 4, cy + 10), (cx + 12, cy + 1)], fill=STATE_SUCCESS, width=2)
        else:
            d.ellipse([(cx + 1, cy + 1), (cx + 11, cy + 11)], outline=TEXT_MUTED, width=2)
        d.text((cx + 22, cy - 2), label, font=item_font, fill=ROW_CHILD_TITLE if done else TEXT_MUTED)

    d.text((x0 + 18, box_bottom + 16), "AI 自己写、自己勾；人只读", font=desc_font, fill=TEXT_MUTED)
    return layer


canvas = gradient()
for index, builder in enumerate((build_sessions, build_state, build_manual)):
    layer = builder()
    canvas.paste(layer, (index * COL_W, 0), layer)

canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)

