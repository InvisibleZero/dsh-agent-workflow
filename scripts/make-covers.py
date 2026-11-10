"""生成三张分图（各 1200x700）：

  01-sessions.png  会话列表（工作区 = 项目，会话 = 单元）
  02-state.png     五态状态机 + 状态决定注入什么
  03-manual.png    两层手册（项目手册 / 会话手册）

重跑本脚本即可全部覆盖。
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 700
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
OUT_DIR = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\dsh-agent-workflow\assets"

PANEL_X, PANEL_Y, PANEL_W, PANEL_H = 72, 190, 1056, 440


def canvas_base(title, subtitle=""):
    canvas = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(canvas)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)))
    title_font = ImageFont.truetype(FONT_BOLD, 40)
    sub_font = ImageFont.truetype(FONT_REG, 20)
    d.text((PANEL_X, 64), title, font=title_font, fill=TEXT_PRIMARY)
    if subtitle != "":
        d.text((PANEL_X, 124), subtitle, font=sub_font, fill=TEXT_SECONDARY)
    return canvas


def panel_layer():
    panel = Image.new("RGBA", (PANEL_W, PANEL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)
    d.rounded_rectangle([(0, 0), (PANEL_W - 1, PANEL_H - 1)], radius=16, fill=PANEL_BG, outline=PANEL_BORDER, width=1)
    return panel, d


def paste(canvas, panel):
    canvas.paste(panel, (PANEL_X, PANEL_Y), panel)


def draw_arrow(d, x, y, color, length=12):
    d.line([(x, y), (x + length - 5, y)], fill=color, width=2)
    d.polygon([(x + length - 6, y - 4), (x + length, y), (x + length - 6, y + 4)], fill=color)


# ---------------------------------------------------------------- 01 会话列表
def build_sessions():
    canvas = canvas_base("工作区 = 项目，会话 = 单元", "打开任意会话，它自动成为 workflow 节点，开始走状态机")
    panel, d = panel_layer()

    header = ImageFont.truetype(FONT_REG, 15)
    proj = ImageFont.truetype(FONT_BOLD, 20)
    row_font = ImageFont.truetype(FONT_REG, 19)
    state_font = ImageFont.truetype(FONT_REG, 14)
    note_font = ImageFont.truetype(FONT_REG, 14)

    d.text((24, 20), "工作区", font=header, fill=TEXT_MUTED)
    d.text((24, 46), "电商系统改造", font=proj, fill=TEXT_PRIMARY)

    rows = [
        ("登录模块", "实现中", STATE_BRAND, True),
        ("支付回调加固", "已完结", STATE_SUCCESS, False),
        ("订单状态机", "讨论中", STATE_WARN, False),
        ("退货流程", "未开始", STATE_IDLE, False),
        ("发票系统", "未开始", STATE_IDLE, False),
    ]
    y = 100
    for title, state, color, selected in rows:
        if selected:
            d.rounded_rectangle([(14, y - 7), (PANEL_W - 14, y + 38)], radius=8, fill=ROW_SELECTED)
        d.ellipse([(28, y + 8), (37, y + 17)], fill=color)
        d.text((50, y + 2), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        tw = d.textlength(state, font=state_font)
        d.text((PANEL_W - 26 - tw, y + 5), state, font=state_font, fill=color)
        y += 56

    d.text((24, PANEL_H - 42), "每个会话 = 一个 workflow 单元；工作区就是它们所属的项目", font=note_font, fill=TEXT_MUTED)
    paste(canvas, panel)
    canvas.save(f"{OUT_DIR}/01-sessions.png", "PNG")
    print("written 01-sessions.png")


# ---------------------------------------------------------------- 02 状态机
def build_state():
    canvas = canvas_base("五态状态机", "每次推进，都把该状态的操作细节注入给模型")
    panel, d = panel_layer()

    label = ImageFont.truetype(FONT_REG, 15)
    pill_font = ImageFont.truetype(FONT_REG, 13)
    head_font = ImageFont.truetype(FONT_BOLD, 16)
    code_font = ImageFont.truetype(FONT_REG, 15)
    dim_font = ImageFont.truetype(FONT_REG, 13)

    states = [
        ("未开始", STATE_IDLE, False),
        ("讨论中", STATE_WARN, False),
        ("实现中", STATE_BRAND, True),
        ("验收中", STATE_WARN, False),
        ("已完结", STATE_SUCCESS, False),
    ]
    pill_w, pill_h = 128, 36
    x, y = 24, 26
    for index, (text, color, active) in enumerate(states):
        fill = (40, 52, 84) if active else CODE_BG
        outline = color if active else CODE_BORDER
        d.rounded_rectangle([(x, y), (x + pill_w, y + pill_h)], radius=9, fill=fill, outline=outline, width=1)
        tw = d.textlength(text, font=pill_font)
        d.text((x + (pill_w - tw) / 2, y + 9), text, font=pill_font, fill=(255, 255, 255) if active else color)
        x += pill_w
        if index < len(states) - 1:
            draw_arrow(d, x + 6, y + pill_h // 2, STATE_IDLE, 16)
            x += 26

    d.text((24, 90), "当前状态决定注入什么", font=label, fill=TEXT_MUTED)

    # 讨论中
    d.text((24, 118), "讨论中", font=head_font, fill=STATE_WARN)
    d.rounded_rectangle([(24, 142), (PANEL_W - 24, 142 + 62)], radius=10, fill=CODE_BG, outline=CODE_BORDER, width=1)
    d.text((44, 158), "只讨论不动手：给方案、取舍与待确认点。", font=code_font, fill=ROW_CHILD_TITLE)

    # 实现中（当前态）
    d.text((24, 222), "实现中", font=head_font, fill=STATE_BRAND)
    d.text((24 + d.textlength("实现中", font=head_font) + 12, 224), "当前态", font=dim_font, fill=ACCENT)
    d.rounded_rectangle([(24, 246), (PANEL_W - 24, 246 + 118)], radius=10, fill=CODE_BG, outline=(58, 86, 150), width=1)
    lines = [
        "本阶段按已确认的方案落地。",
        "先读后改：只改相关文件，改动越少越好。",
        "完成后给出验证方式与通过标准。",
        "每完成一层，勾掉「实施顺序」里对应那条。",
    ]
    ly = 262
    for line in lines:
        d.text((44, ly), line, font=code_font, fill=ROW_CHILD_TITLE)
        ly += 26

    d.text((24, PANEL_H - 42), "可返工：实现中 → 讨论中；验收中 → 实现中 / 讨论中", font=dim_font, fill=TEXT_MUTED)
    paste(canvas, panel)
    canvas.save(f"{OUT_DIR}/02-state.png", "PNG")
    print("written 02-state.png")


# ---------------------------------------------------------------- 03 两层手册
def build_manual():
    canvas = canvas_base("两层手册（AI 自留）", "项目级记忆跨会话延续，会话级记忆各自独立")
    panel, d = panel_layer()

    head_font = ImageFont.truetype(FONT_BOLD, 17)
    file_font = ImageFont.truetype(FONT_BOLD, 17)
    desc_font = ImageFont.truetype(FONT_REG, 14)
    item_font = ImageFont.truetype(FONT_REG, 15)

    def file_icon(x, y):
        d.line([(x, y), (x + 11, y), (x + 14, y + 3), (x + 20, y + 3)], fill=ACCENT, width=2)
        d.line([(x, y), (x, y + 22), (x + 20, y + 22), (x + 20, y + 5)], fill=ACCENT, width=2)

    # 项目手册
    d.rounded_rectangle([(24, 24), (PANEL_W - 24, 24 + 116)], radius=12, fill=CODE_BG, outline=CODE_BORDER, width=1)
    file_icon(44, 44)
    d.text((80, 40), "项目手册.md", font=file_font, fill=TEXT_PRIMARY)
    d.text((80, 68), "项目总览 / 决策记录 / 要点与疑难杂症 · 跨会话共享", font=desc_font, fill=TEXT_MUTED)
    d.text((44, 102), "由各会话收尾时回写结论，是项目的「当前状态」", font=item_font, fill=STATE_SUCCESS)

    # 会话手册
    d.rounded_rectangle([(24, 156), (PANEL_W - 24, 24 + 400)], radius=12, fill=CODE_BG, outline=(58, 86, 150), width=1)
    file_icon(44, 176)
    d.text((80, 172), "会话手册-<node_id>.md", font=file_font, fill=TEXT_PRIMARY)
    d.text((80, 200), "方案（5 层）+ 实施顺序 · 每会话一份", font=desc_font, fill=TEXT_MUTED)

    d.text((44, 228), "## 方案（上层 → 下层）", font=item_font, fill=ROW_TITLE)
    layers = ["1. 目标与验收", "2. 对外契约", "3. 结构与依赖", "4. 数据与状态", "5. 表现与文案"]
    for i, line in enumerate(layers):
        d.text((60 + (i % 2) * 300, 254 + (i // 2) * 26), line, font=item_font, fill=ROW_CHILD_TITLE)

    d.text((44, 340), "## 实施顺序", font=item_font, fill=ROW_TITLE)
    checks = [("2. 对外契约", True), ("3. 结构与依赖", True), ("4. 数据与状态", False), ("5. 表现与文案", False)]
    for i, (label, done) in enumerate(checks):
        cx = 60 + (i % 2) * 300
        cy = 368 + (i // 2) * 28
        if done:
            d.line([(cx, cy + 6), (cx + 4, cy + 10)], fill=STATE_SUCCESS, width=2)
            d.line([(cx + 4, cy + 10), (cx + 12, cy + 1)], fill=STATE_SUCCESS, width=2)
        else:
            d.ellipse([(cx + 1, cy + 1), (cx + 11, cy + 11)], outline=TEXT_MUTED, width=2)
        d.text((cx + 22, cy - 2), label, font=item_font, fill=ROW_CHILD_TITLE if done else TEXT_MUTED)

    paste(canvas, panel)
    canvas.save(f"{OUT_DIR}/03-manual.png", "PNG")
    print("written 03-manual.png")


build_sessions()
build_state()
build_manual()
