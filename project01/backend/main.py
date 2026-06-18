from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
import requests
import random
import json
import os
import hmac
import hashlib
import base64
import time
from dotenv import load_dotenv
from langgraph.graph import StateGraph, MessagesState, START, END
from typing import List, Optional
from pathlib import Path
import shutil
from openai import OpenAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import QdrantVectorStore

app = FastAPI()

# Guarantee loading the correct .env file using absolute path relative to main.py
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

coding_llm_model = ChatOpenAI(model="gpt-4.1")

# Load email credentials from environment variables
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "")
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-flowbuilder-jwt-signing-key-123456")

app.add_middleware(
    CORSMiddleware,
    allow_origins="*",            # List of allowed origins
    allow_credentials=True,           # Support cookies in cross-origin requests
    allow_methods=["*"],              # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],              # Allow all headers
)

# --- LIGHTWEIGHT JWT IMPLEMENTATION USING ONLY BUILT-IN PYTHON MODULES ---
def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(data: str) -> bytes:
    padding = '=' * (4 - (len(data) % 4))
    return base64.urlsafe_b64decode(data + padding)

def create_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload).encode('utf-8'))
    
    signature_base = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(JWT_SECRET.encode('utf-8'), signature_base, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def decode_jwt(token: str) -> Optional[dict]:
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        
        header_b64, payload_b64, signature_b64 = parts
        
        # Verify signature
        signature_base = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_signature = hmac.new(JWT_SECRET.encode('utf-8'), signature_base, hashlib.sha256).digest()
        expected_signature_b64 = base64url_encode(expected_signature)
        
        if not hmac.compare_digest(signature_b64, expected_signature_b64):
            return None
        
        payload = json.loads(base64url_decode(payload_b64).decode('utf-8'))
        
        # Check expiration
        if "exp" in payload and payload["exp"] < time.time():
            return None
            
        return payload
    except Exception:
        return None

class messageStates(BaseModel):
     query:str
     subject:Optional[str]=None
     body:Optional[str]=None
     accuracy:Optional[str]=None
     email:Optional[str]=None
     Ai_Response:Optional[str]=None
     Resume:Optional[str]=None
     book_text:Optional[str]=None
     questions:Optional[str]=None
     mcqs:Optional[str]=None
     study_plan:Optional[str]=None

# Request body model
class ProcessRequest(BaseModel):
    state: messageStates
    int_map: Optional[List[int]]=None

# Auth request models
class EmailRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class CanvasStateRequest(BaseModel):
    email: str
    addedNodeIds: List[str]

# Database settings
DB_FILE = Path(__file__).parent / "db.json"

def load_canvas_states():
    if DB_FILE.exists():
        try:
            with open(DB_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_canvas_states(states):
    try:
        with open(DB_FILE, "w") as f:
            json.dump(states, f, indent=4)
    except Exception:
        pass

# In-memory OTP store (email -> OTP code)
otp_store = {}

# ── Brevo (Sendinblue) HTTP API email sender ──────────────────────────────
# Free plan: 300 emails/day, any recipient, just verify sender email
# Docs: https://developers.brevo.com/reference/sendtransacemail
def send_email(receiver_email: str, subject: str, html_body: str = None, text_body: str = None) -> bool:
    api_key = os.getenv("BREVO_API_KEY") or BREVO_API_KEY
    sender = os.getenv("SENDER_EMAIL") or SENDER_EMAIL
    if not api_key:
        return False
    if not sender:
        return False

    payload = {
        "sender": {"name": "FlowBuilder AI", "email": sender},
        "to": [{"email": receiver_email}],
        "subject": subject,
    }
    if html_body:
        payload["htmlContent"] = html_body
    if text_body:
        payload["textContent"] = text_body

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept": "application/json",
                "api-key": api_key,
                "content-type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        if response.status_code == 201:
            return True
        else:
            return False
    except Exception:
        return False

# OTP email sender
def send_email_otp(receiver_email: str, otp_code: str) -> bool:
    body_text = f"""Hello,

Your Flowbuilder verification OTP code is: {otp_code}

Please enter this 6-digit code in the login screen to verify your email.

Best regards,
Flowbuilder AI Team"""
    return send_email(receiver_email, "Your Flowbuilder Verification Code", text_body=body_text)

#SYSTEM PROMPT
SYSTEM_PROMPT_Resume_Reviewer="""
   You are an expert technical recruiter and resume reviewer. You will be given a Resume.
   Provide a concise, clear, and actionable review. Highlight strengths briefly and focus primarily on specific areas of improvement to increase chances of getting shortlisted for technical interviews.
"""

SYSTEM_PROMPT_Cover_Letter="""
   You are an ai helpfull assitant you will be given Job description  you have to return your the cover letter  
"""

SYSTEM_PROMPT_Important_Questions="""
   You are an expert technical interviewer. You will be given content from a resume, study material, or a topic.
   Based on the provided content, list the most important and challenging questions that an interviewer is likely to ask in a technical interview.
   Format your response as a numbered list of clear, concise interview questions. Focus on testing deep technical understanding.
"""

SYSTEM_PROMPT_MCQ_Generator="""
   You are an expert technical interviewer and quiz creator. You will be given study material, a topic, or a Job Description (JD).
   Generate 10 well-crafted multiple choice questions (MCQs) focused on testing skills relevant to technical interviews based on the provided content.
   Mark the correct answer clearly. Make the distractors plausible to test deep technical understanding.
   Format: Q1. [question]\nA) ... B) ... C) ... D) ...\nAnswer: [letter]
"""

SYSTEM_PROMPT_Study_Planner="""
   You are a professional academic coach and study planner AI. You will be given a topic or syllabus description.
   Create a detailed, structured study plan with:
   - Daily/weekly schedule breakdown
   - Key topics and sub-topics to cover
   - Recommended resources and study techniques
   - Milestones and revision checkpoints
   Make the plan realistic and actionable for a dedicated student.
"""

# Action node: directly emails whatever AI response is already in state to the recipient
def Send_AI_Response(state):
      receiver_email = state.email
      if not receiver_email:
          return state

      username = receiver_email.split('@')[0]

      # ── Collect ALL non-empty AI sections ────────────────────────────────────
      SECTIONS = [
          ("Ai_Response",  "🤖 AI Review",                  "#4f46e5"),  # indigo
          ("mcqs",         "📝 Multiple Choice Questions",   "#059669"),  # emerald
          ("questions",    "❓ Important Questions",          "#d97706"),  # amber
          ("study_plan",   "📅 Study Plan",                  "#0284c7"),  # sky
      ]

      collected = []
      subject_parts = []
      for field, label, color in SECTIONS:
          value = getattr(state, field, None)
          if value and isinstance(value, str) and value.strip():
              collected.append((label, color, value.strip()))
              subject_parts.append(label.split(" ", 1)[-1])   # e.g. "AI Review"

      # Fallback: use body/subject from older nodes
      if not collected and state.body:
          collected.append((state.subject or "AI Response", "#6366f1", state.body))
          subject_parts.append("Response")

      if not collected:
          return state

      email_subject = f"Your AI Results: {' + '.join(subject_parts)} (for {username})"

      # ── Build styled HTML email ───────────────────────────────────────────────
      sections_html = ""
      for label, color, content in collected:
          # Convert plain-text newlines to <br> for HTML
          content_html = content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
          sections_html += f"""
          <div style="margin-bottom:28px; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <div style="background:{color}; padding:12px 20px;">
              <h2 style="margin:0; font-size:15px; font-weight:700; color:#ffffff; letter-spacing:0.3px;">{label}</h2>
            </div>
            <div style="background:#ffffff; padding:18px 20px; font-size:14px; line-height:1.7; color:#374151;">
              {content_html}
            </div>
          </div>
          """

      html_body = f"""
      <!DOCTYPE html>
      <html lang="en">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:640px;margin:32px auto;padding:0 16px;">

          <!-- Header -->
          <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:28px 28px 20px;">
            <div style="font-size:28px;margin-bottom:6px;">✨</div>
            <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;">Your AI Flow Results</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#c4b5fd;">Hi <strong>{username}</strong>, here are your combined AI-generated results.</p>
          </div>

          <!-- Body -->
          <div style="background:#f9fafb;padding:24px 20px;">
            {sections_html}
          </div>

          <!-- Footer -->
          <div style="background:#1f2937;border-radius:0 0 16px 16px;padding:16px 24px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">Generated by <strong style="color:#a78bfa;">AI Flow Builder</strong> &mdash; {len(collected)} section(s) included</p>
          </div>

        </div>
      </body>
      </html>
      """

      send_email(receiver_email, email_subject, html_body=html_body)

      return state

def build_combined_context(state):
      """Combines all available state inputs into a single rich context string."""
      parts = []
      if getattr(state, "Resume", None) and state.Resume.strip():
          parts.append(f"--- CANDIDATE RESUME ---\n{state.Resume.strip()}")
      if getattr(state, "query", None) and state.query.strip():
          parts.append(f"--- JOB DESCRIPTION (JD) ---\n{state.query.strip()}")
      if getattr(state, "topic", None) and state.topic.strip():
          parts.append(f"--- TARGET TOPIC / SYLLABUS ---\n{state.topic.strip()}")
      if getattr(state, "book_text", None) and state.book_text.strip():
          parts.append(f"--- BOOK / REFERENCE MATERIAL ---\n{state.book_text.strip()}")
      if getattr(state, "Ai_Response", None) and state.Ai_Response.strip():
          parts.append(f"--- PREVIOUS AI REVIEW / FEEDBACK ---\n{state.Ai_Response.strip()}")
          
      if not parts:
          return "No specific context provided."
          
      return "\n\n".join(parts)

# take Resume and send the opinion 
def Resume_Reviewer(state):
      
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      combined_content = build_combined_context(state)

      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Resume_Reviewer},
                    {"role":"user","content":combined_content}
                ]
            )
      state.Ai_Response=response.Ai_Response
      return state

# Important Questions from book/PDF text
# Chain-aware: book_text > Resume (from Resume Reviewer) > Ai_Response (prev node) > query
# NOTE: does NOT overwrite Ai_Response so previous node output is preserved in results
def Important_Questions(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      combined_content = build_combined_context(state)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Important_Questions},
                    {"role":"user","content":combined_content}
                ]
            )
      state.questions = response.questions
      return state

# MCQ Generator
# Chain-aware: book_text > Resume (from Resume Reviewer) > Ai_Response (prev node) > query
# NOTE: does NOT overwrite Ai_Response so previous node output is preserved in results
def MCQ_Generator(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      combined_content = build_combined_context(state)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_MCQ_Generator},
                    {"role":"user","content":combined_content}
                ]
            )
      state.mcqs = response.mcqs
      return state

# Study Planner
# Chain-aware: Resume (raw resume for targeted plan) > Ai_Response (prev node review) > query
# NOTE: does NOT overwrite Ai_Response so previous node output is preserved in results
def Study_Planner(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      combined_content = build_combined_context(state)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Study_Planner},
                    {"role":"user","content":combined_content}
                ]
            )
      state.study_plan = response.study_plan
      return state

# cover letter Gen
def Cover_Letter(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      combined_content = build_combined_context(state)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Cover_Letter},
                    {"role":"user","content":combined_content}
                ]
            )
      state.Ai_Response=response.Ai_Response
      return state


#mapping 
mapping = {
     "1":Send_AI_Response.__name__,
     "3":START,
     "4":END,
     "5":Resume_Reviewer.__name__,
     "6":Cover_Letter.__name__,
     "7":Important_Questions.__name__,
     "8":MCQ_Generator.__name__,
     "9":Study_Planner.__name__
}


@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/pre-fun")
async def getId():
    return mapping

@app.get("/test-email")
async def test_email(to: str):
    """Debug endpoint — sends a test email via Brevo to verify config."""
    success = send_email(
        to,
        "✅ Brevo Test from FlowBuilder",
        text_body="If you received this, Brevo email is working correctly on your backend!"
    )
    if success:
        return {"ok": True, "from": SENDER_EMAIL, "to": to}
    return {"ok": False, "error": "Failed to send — check BREVO_API_KEY and SENDER_EMAIL in .env"}

@app.post("/process")
def process(request:ProcessRequest):
      
      intial_state=messageStates(
           query=request.state.query,
           subject="",
           body="",
           accuracy="",
           email=request.state.email,
           Resume=request.state.Resume,
           book_text=request.state.book_text
      )
      graph = StateGraph(messageStates)
      graph.add_node(Send_AI_Response)
      graph.add_node(Resume_Reviewer)
      graph.add_node(Cover_Letter)
      graph.add_node(Important_Questions)
      graph.add_node(MCQ_Generator)
      graph.add_node(Study_Planner)
      #add edge
     #  VARIABLE1=mapping[str(request.int_map[0])]
     #  graph.add_edge(START,VARIABLE1)

      # add loop 
      
      for i in range(1,len(request.int_map)):
           graph.add_edge(mapping[str(request.int_map[i-1])],mapping[str(request.int_map[i])])

     #  Last_var=mapping[str(request.int_map[-1])]
     #  graph.add_edge(Last_var,END)
      graph = graph.compile()

      result = graph.invoke(intial_state)
      return result


# --- AUTHENTICATION & CANVAS PERSISTENCE ENDPOINTS ---

@app.post("/auth/send-otp")
async def send_otp(request: EmailRequest):
    email = request.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"
    otp_store[email] = otp
    
    # Try sending the OTP email
    email_sent = send_email_otp(email, otp)
   
    
    return {
        "message": "OTP sent successfully",
        "email_sent": email_sent
    }

@app.post("/auth/verify-otp")
async def verify_otp(request: VerifyOTPRequest):
    email = request.email.strip().lower()
    otp = request.otp.strip()
    
    if email not in otp_store or otp_store[email] != otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    # Clear OTP code
    del otp_store[email]
    
    # Fetch saved progress
    states = load_canvas_states()
    saved_nodes = states.get(email, ["3", "4"])
    
    # Create valid HS256 JWT token with 7 days expiration
    payload = {
        "email": email,
        "exp": time.time() + 7 * 24 * 3600
    }
    token = create_jwt(payload)
    
    return {
        "message": "Verification successful",
        "email": email,
        "token": token,
        "addedNodeIds": saved_nodes
    }

@app.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split(" ")[1]
    payload = decode_jwt(token)
    if not payload or "email" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    
    email = payload["email"]
    states = load_canvas_states()
    saved_nodes = states.get(email, ["3", "4"])
    
    return {
        "email": email,
        "addedNodeIds": saved_nodes
    }

@app.post("/canvas/state")
async def save_state(request: CanvasStateRequest):
    email = request.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    states = load_canvas_states()
    states[email] = request.addedNodeIds
    save_canvas_states(states)
    
    return {"message": "Canvas state saved successfully"}

@app.get("/canvas/state")
async def get_state(email: str):
    email = email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    states = load_canvas_states()
    saved_nodes = states.get(email, ["3", "4"])
    return {"addedNodeIds": saved_nodes}
