import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Office Automation AI Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/extract-form")
async def process_document_agent(file: UploadFile = File(...)):
    # ۱. استخراج پسوند فایل برای تشخیص نوع سند
    filename, file_extension = os.path.splitext(file.filename)
    extension = file_extension.lower()

    # ۲. شبیه‌سازی مسیردهی LangGraph (Routing)
    # در آینده، اینجا گره‌های LangGraph صدا زده می‌شوند
    processor_node = ""
    if extension in ['.jpg', '.jpeg', '.png']:
        processor_node = "Vision_OCR_Node"
    elif extension in ['.doc', '.docx']:
        processor_node = "Word_Parser_Node"
    elif extension == '.pdf':
        processor_node = "PDF_Parser_Node"
    else:
        return {"status": "error", "message": "فرمت فایل پشتیبانی نمی‌شود. لطفاً PDF، Word یا عکس آپلود کنید."}

    # ۳. بازگرداندن خروجی تستی برای توسعه فرانت‌اند
    return {
        "filename": file.filename,
        "status": "success",
        "simulated_node": processor_node,
        "message": f"فایل با موفقیت در گره {processor_node} پردازش شد (حالت تستی).",
        "form_schema": {
            "title": f"فرم استخراج شده از سند {extension}",
            "fields": [
                {"name": "national_id", "label": "کد ملی", "type": "number", "maxLength": 10},
                {"name": "mobile", "label": "شماره همراه", "type": "text", "maxLength": 11, "pattern": "^09\\d{9}$"},
                {
                    "name": "family_members",
                    "label": "اعضای خانواده",
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 5,
                    "itemSchema": [
                        {"name": "first_name", "label": "نام", "type": "text"},
                        {"name": "last_name", "label": "نام خانوادگی", "type": "text"}
                    ]
                }
            ]
        }
    }