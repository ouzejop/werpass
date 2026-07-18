from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).parent
MARKER = "SYNTHETIC DEMO - NOT A REAL MEDICAL RECORD"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "arialbd.ttf" if bold else "arial.ttf"
    return ImageFont.truetype(name, size)


def draw_pdf() -> None:
    output = ROOT / "prescription-demo.pdf"
    canvas = Canvas(str(output), pagesize=A4)
    width, height = A4
    canvas.setFillColor("#8b1e3f")
    canvas.rect(0, height - 46, width, 46, stroke=0, fill=1)
    canvas.setFillColor("white")
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(42, height - 29, MARKER)
    canvas.setFillColor("#172033")
    canvas.setFont("Helvetica-Bold", 22)
    canvas.drawString(54, height - 108, "Example prescription")
    canvas.setFont("Helvetica", 11)
    canvas.drawString(54, height - 135, "Fictional Clinic | Date: 2030-01-15")
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(54, height - 178, "Patient: PATIENT DEMO 001")
    canvas.line(54, height - 194, width - 54, height - 194)
    canvas.setFont("Helvetica-Bold", 12)
    canvas.drawString(54, height - 232, "Example medication")
    canvas.setFont("Helvetica", 12)
    canvas.drawString(54, height - 256, "DEMO-MED 10 mg - example dosage only")
    canvas.drawString(54, height - 278, "Take one tablet once daily for the demonstration scenario.")
    canvas.setFillColor("#5e6472")
    canvas.setFont("Helvetica-Oblique", 10)
    canvas.drawString(54, 58, "Synthetic fixture only. It must never be interpreted as clinical advice.")
    canvas.save()


def draw_jpeg() -> None:
    output = ROOT / "lab-result-demo.jpg"
    image = Image.new("RGB", (1600, 1050), "#f7f8fb")
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((0, 0, 1600, 96), fill="#8b1e3f")
    drawing.text((46, 28), MARKER, font=font(28, True), fill="white")
    drawing.text((74, 160), "Example laboratory result", font=font(44, True), fill="#172033")
    drawing.text((74, 220), "Fictional Laboratory | Date: 2030-02-20", font=font(24), fill="#3c465b")
    drawing.text((74, 290), "Patient: PATIENT DEMO 002", font=font(28, True), fill="#172033")
    drawing.line((74, 346, 1526, 346), fill="#c4cad5", width=3)
    drawing.text((90, 394), "Test", font=font(24, True), fill="#172033")
    drawing.text((710, 394), "Example value", font=font(24, True), fill="#172033")
    drawing.line((74, 438, 1526, 438), fill="#c4cad5", width=2)
    drawing.text((90, 478), "DEMO-VALUE", font=font(28), fill="#172033")
    drawing.text((710, 478), "42 (example only)", font=font(28), fill="#172033")
    drawing.rounded_rectangle((90, 590, 740, 735), radius=12, fill="#e4e7ed")
    drawing.text((120, 632), "[ intentionally illegible demo zone ]", font=font(23, True), fill="#5e6472")
    drawing.text((74, 955), "Synthetic fixture only. Not clinical advice.", font=font(22), fill="#5e6472")
    image.save(output, "JPEG", quality=92, optimize=True)


if __name__ == "__main__":
    draw_pdf()
    draw_jpeg()
