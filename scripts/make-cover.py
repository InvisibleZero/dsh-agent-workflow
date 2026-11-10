"""生成插件封面：左侧标题+卖点，右侧嵌入真实界面截图（侧栏工作区树）。"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (13, 17, 23)
BG_BOTTOM = (26, 34, 48)
ACCENT = (77, 123, 253)
TEXT_PRIMARY = (240, 244, 251)
TEXT_SECONDARY = (147, 164, 191)
TEXT_MUTED = (127, 142, 166)

FONT_REG = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
SCREENSHOT = r"C:\Users\Administrator\.dsh\attachments\v1\objects\6f\6f135f23be41b03dfddc24814706bfddce9a4e30ab0a8bcf7c2bbb48f80dc01f"
OUT = r"C:\Users\Administrator\Documents\deepseek-harness\default-workspace\dsh-agent-workflow\assets\cover.png"


def gradient_canvas():
    canvas = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(canvas)
    for y in range(H):
        t = y / (H - 1)
        color = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=color)
    return canvas


def rounded_card(size, radius, fill, outline):
    card = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle([(0, 0), (size[0] - 1, size[1] - 1)], radius=radius, fill=fill, outline=outline, width=1)
    return card


canvas = gradient_canvas()

# 左上角品牌方块
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

# 右侧：真实界面截图（侧栏工作区树），圆角裁切后贴进卡片
shot = Image.open(SCREENSHOT).convert("RGB")
crop = shot.crop((4, 262, 300, 470))  # 只看侧栏「工作区」树那一段
card_w, card_h = 512, 348
CARD_X, CARD_Y = 636, 152
scale = max(card_w / crop.width, card_h / crop.height)
scaled = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
left = (scaled.width - card_w) // 2
top = (scaled.height - card_h) // 2
scaled = scaled.crop((left, top, left + card_w, top + card_h))

mask = Image.new("L", (card_w, card_h), 0)
ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (card_w - 1, card_h - 1)], radius=14, fill=255)

card = rounded_card((card_w, card_h), 14, (22, 27, 35, 255), (44, 52, 66, 255))
inner = scaled.resize((card_w - 2, card_h - 2), Image.LANCZOS)
inner_mask = Image.new("L", (card_w - 2, card_h - 2), 0)
ImageDraw.Draw(inner_mask).rounded_rectangle([(0, 0), (card_w - 3, card_h - 3)], radius=13, fill=255)
card.paste(inner, (1, 1), inner_mask)
canvas.paste(card, (CARD_X, CARD_Y), card)

# 卡片外阴影（简单几层半透明描边模拟）
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
for i in range(6, 0, -1):
    sd.rounded_rectangle(
        [(CARD_X - i, CARD_Y - i), (CARD_X + card_w + i, CARD_Y + card_h + i)],
        radius=14 + i,
        outline=(0, 0, 0, 18),
        width=1,
    )
canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)

canvas.convert("RGB").save(OUT, "PNG")
print("written", OUT, canvas.size)

