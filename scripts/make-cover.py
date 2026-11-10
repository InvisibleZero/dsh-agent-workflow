"""生成插件封面：总宽 1200（与单图同宽），横向分三个区域：

  左  ：会话列表（工作区 = 项目，会话 = 单元）
  中  ：四态状态机 + 状态决定注入什么 + 写操作门禁
  右  ：两层手册（项目手册 / 会话手册）

每个区域先在 400 宽的图层上画，再整体拼到总图上。
改文案重跑本脚本即可覆盖 assets/cover.png。
"""

from PIL import Image, ImageDraw, ImageFont

COL_W = 400
COLS = 3
W, H = COL_W * COLS, 820
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
STATE_VERIFY = (139, 92, 246)
STATE_SUCCESS = (63, 185, 80)
CODE_BG = (15, 19, 25)
CODE_BORDER = (44, 52, 66)

FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
OUT = r"C:\Users\QINBAI\Documents\deepseek-harness\default-workspace\dsh-agent-workflow\assets\cover.png"

PANEL_TOP, PANEL_BOTTOM = 92, H - 16


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


def draw_arrow(d, x, y, color, length=13):
    d.line([(x, y), (x + length - 5, y)], fill=color, width=2)
    d.polygon([(x + length - 6, y - 3), (x + length, y), (x + length - 6, y + 3)], fill=color)


def header(d, title, subtitle):
    d.text((20, 22), title, font=ImageFont.truetype(FONT_BOLD, 18), fill=TEXT_PRIMARY)
    d.text((20, 54), subtitle, font=ImageFont.truetype(FONT_REG, 12), fill=TEXT_SECONDARY)


def panel_box(d):
    d.rounded_rectangle([(12, PANEL_TOP), (COL_W - 12, PANEL_BOTTOM)], radius=14, fill=PANEL_BG, outline=PANEL_BORDER, width=1)


# ------------------------------------------------------------------ 左：会话
def build_sessions():
    layer, d = new_column()
    header(d, "工作区 = 项目，会话 = 单元", "选工作流模式的会话，打开即成为节点")
    panel_box(d)

    small = ImageFont.truetype(FONT_REG, 12)
    proj = ImageFont.truetype(FONT_BOLD, 16)
    row_font = ImageFont.truetype(FONT_REG, 14)
    state_font = ImageFont.truetype(FONT_REG, 11)
    note_font = ImageFont.truetype(FONT_REG, 11)

    d.text((32, PANEL_TOP + 18), "工作区", font=small, fill=TEXT_MUTED)
    d.text((32, PANEL_TOP + 38), "电商系统改造", font=proj, fill=TEXT_PRIMARY)

    # 按状态从前往后排：两个讨论中、两个实现中、一个验收中、一个已完结。
    rows = [
        ("订单状态机", "今天 14:02 · 讨论 2 轮", "讨论中", STATE_WARN, False),
        ("用户中心", "今天 11:40 · 方案待写", "讨论中", STATE_WARN, False),
        ("登录模块", "今天 10:15 · 改 4 个文件", "实现中", STATE_BRAND, True),
        ("支付回调加固", "昨天 18:20 · 改 6 个文件", "实现中", STATE_BRAND, False),
        ("退货流程", "昨天 09:05 · 验收 3 项", "验收中", STATE_VERIFY, False),
        ("发票系统", "11-09 · 已完结归档", "已完结", STATE_SUCCESS, False),
    ]
    y = PANEL_TOP + 70
    for title, meta, state, color, selected in rows:
        if selected:
            d.rounded_rectangle([(22, y - 8), (COL_W - 22, y + 60)], radius=7, fill=ROW_SELECTED)
        d.ellipse([(32, y + 6), (39, y + 13)], fill=color)
        d.text((48, y), title, font=row_font, fill=ROW_TITLE if selected else ROW_CHILD_TITLE)
        d.text((48, y + 22), meta, font=note_font, fill=TEXT_MUTED)
        tw = d.textlength(state, font=state_font)
        d.text((COL_W - 34 - tw, y + 3), state, font=state_font, fill=color)
        y += 84

    d.text((32, PANEL_BOTTOM - 20), "每个会话 = 一个 workflow 单元", font=note_font, fill=TEXT_MUTED)
    return layer


# ------------------------------------------------------------------ 中：状态机
def build_state():
    layer, d = new_column()
    header(d, "四态状态机 + 门禁", "状态决定能做什么；切换要你点同意")
    panel_box(d)

    small = ImageFont.truetype(FONT_REG, 11)
    pill_font = ImageFont.truetype(FONT_REG, 10)
    head_font = ImageFont.truetype(FONT_BOLD, 13)
    code_font = ImageFont.truetype(FONT_REG, 11)
    dim_font = ImageFont.truetype(FONT_REG, 10)

    d.text((32, PANEL_TOP + 18), "每个会话走四态状态机", font=small, fill=TEXT_MUTED)

    states = [
        ("讨论中", STATE_WARN, False),
        ("实现中", STATE_BRAND, True),
        ("验收中", STATE_VERIFY, False),
        ("已完结", STATE_SUCCESS, False),
    ]
    pill_w, pill_h = 58, 26
    x, y = 32, PANEL_TOP + 40
    for index, (text, color, active) in enumerate(states):
        fill = (40, 52, 84) if active else CODE_BG
        outline = color if active else CODE_BORDER
        d.rounded_rectangle([(x, y), (x + pill_w, y + pill_h)], radius=7, fill=fill, outline=outline, width=1)
        tw = d.textlength(text, font=pill_font)
        d.text((x + (pill_w - tw) / 2, y + 7), text, font=pill_font, fill=(255, 255, 255) if active else color)
        x += pill_w
        if index < len(states) - 1:
            draw_arrow(d, x + 3, y + pill_h // 2, STATE_IDLE, 11)
            x += 14

    d.text((32, PANEL_TOP + 84), "当前状态决定注入什么", font=small, fill=TEXT_MUTED)

    sections = [
        ("讨论中", STATE_WARN, [
            "只讨论不动手：改文件会被门禁拒绝。",
            "方案写进手册，不许碰代码。",
        ]),
        ("实现中", STATE_BRAND, [
            "先读后改，只改与目标相关的文件。",
            "完成一层勾掉，停下来等「继续」。",
        ]),
        ("验收中", STATE_VERIFY, [
            "只核对与报告，结论要带证据。",
            "改动须在检查表里注明。",
        ]),
        ("已完结", STATE_SUCCESS, [
            "没有阶段约束，可以自由改动。",
        ]),
    ]
    y = PANEL_TOP + 104
    for index, (title, color, lines) in enumerate(sections):
        d.text((32, y), title, font=head_font, fill=color)
        if index == 1:
            d.text((32 + d.textlength(title, font=head_font) + 8, y + 2), "当前态", font=dim_font, fill=ACCENT)
        box_top = y + 18
        box_h = 34 + (len(lines) - 1) * 18
        d.rounded_rectangle([(32, box_top), (COL_W - 32, box_top + box_h)], radius=8, fill=CODE_BG,
                            outline=(58, 86, 150) if index == 1 else CODE_BORDER, width=1)
        line_y = box_top + 10
        for line in lines:
            d.text((44, line_y), line, font=code_font, fill=ROW_CHILD_TITLE)
            line_y += 18
        y = box_top + box_h + 40

    d.text((32, y + 2), "推进前置：", font=dim_font, fill=TEXT_MUTED)
    d.text((32, y + 20), "方案非空才能进实现中。", font=dim_font, fill=TEXT_MUTED)
    d.text((32, y + 38), "清单全勾才能进验收中。", font=dim_font, fill=TEXT_MUTED)
    return layer


# ------------------------------------------------------------------ 右：手册
def build_manual():
    layer, d = new_column()
    header(d, "两层手册（AI 自留）", "项目级跨会话延续；会话级各自独立，AI 自己写、自己勾")
    panel_box(d)

    file_font = ImageFont.truetype(FONT_BOLD, 13)
    desc_font = ImageFont.truetype(FONT_REG, 10)
    item_font = ImageFont.truetype(FONT_REG, 10)
    note_font = ImageFont.truetype(FONT_REG, 10)

    def file_icon(x, y):
        d.line([(x, y), (x + 9, y), (x + 11, y + 2), (x + 16, y + 2)], fill=ACCENT, width=2)
        d.line([(x, y), (x, y + 18), (x + 16, y + 18), (x + 16, y + 4)], fill=ACCENT, width=2)

    x0, x1 = 28, COL_W - 28

    # 项目手册（一个项目一份）
    d.rounded_rectangle([(x0, PANEL_TOP + 16), (x1, PANEL_TOP + 16 + 92)], radius=10, fill=CODE_BG, outline=CODE_BORDER, width=1)
    file_icon(x0 + 12, PANEL_TOP + 32)
    d.text((x0 + 38, PANEL_TOP + 28), "项目手册", font=file_font, fill=TEXT_PRIMARY)
    d.text((x0 + 38, PANEL_TOP + 50), "总览 / 决策 / 约束 / 坑与防线", font=desc_font, fill=TEXT_MUTED)
    d.text((x0 + 12, PANEL_TOP + 78), "验收中收尾：回写决策与坑", font=note_font, fill=STATE_SUCCESS)

    # 会话手册（每个会话一份，同一个项目下可以有很多份）
    d.text((x0, PANEL_TOP + 122), "每个会话各有一份会话手册", font=note_font, fill=TEXT_MUTED)

    sessions = [
        ("会话手册 1", "方案 5 层 · 实施 2/4", "实现中", STATE_BRAND),
        ("会话手册 2", "方案 5 层 · 实施 4/4", "验收中", STATE_VERIFY),
        ("会话手册 3", "方案编写中", "讨论中", STATE_WARN),
    ]
    layers = ["1. 目标与验收", "2. 对外契约", "3. 结构与依赖", "4. 数据与状态", "5. 表现与文案"]
    checks = [("2. 对外契约", True), ("3. 结构与依赖", True), ("4. 数据与状态", False), ("5. 表现与文案", False)]
    card_h, gap = 184, 6
    top = PANEL_TOP + 140
    for title, desc, state, color in sessions:
        d.rounded_rectangle([(x0, top), (x1, top + card_h)], radius=10, fill=CODE_BG, outline=CODE_BORDER, width=1)
        file_icon(x0 + 12, top + 10)
        d.text((x0 + 38, top + 8), title, font=file_font, fill=TEXT_PRIMARY)
        d.text((x0 + 38, top + 26), desc, font=desc_font, fill=TEXT_MUTED)
        state_w = d.textlength(state, font=desc_font)
        d.ellipse([(x1 - 12 - state_w - 12, top + 13), (x1 - 12 - state_w - 5, top + 20)], fill=color)
        d.text((x1 - 12 - state_w, top + 10), state, font=desc_font, fill=color)

        for i, line in enumerate(layers):
            d.text((x0 + 12, top + 42 + i * 13), line, font=item_font, fill=ROW_CHILD_TITLE)

        d.text((x0 + 12, top + 112), "实施顺序", font=desc_font, fill=ROW_TITLE)
        for i, (label, done) in enumerate(checks):
            cy = top + 128 + i * 13
            cx = x0 + 16
            if done:
                d.line([(cx, cy + 4), (cx + 3, cy + 7)], fill=STATE_SUCCESS, width=2)
                d.line([(cx + 3, cy + 7), (cx + 8, cy + 1)], fill=STATE_SUCCESS, width=2)
            else:
                d.ellipse([(cx + 1, cy + 1), (cx + 7, cy + 7)], outline=TEXT_MUTED, width=2)
            d.text((cx + 14, cy - 2), label, font=item_font, fill=ROW_CHILD_TITLE if done else TEXT_MUTED)
        top += card_h + gap

    return layer


canvas = gradient()
for index, builder in enumerate((build_sessions, build_state, build_manual)):
    layer = builder()
    canvas.paste(layer, (index * COL_W, 0), layer)

canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)

