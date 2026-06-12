from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
import smtplib
import random
import json
import os
import hmac
import hashlib
import base64
import time
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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

# Load SMTP credentials from environment variables (no hardcoded defaults)
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")
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
    except Exception as e:
        print("JWT decode error:", e)
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
        except Exception as e:
            print("Error loading db.json:", e)
    return {}

def save_canvas_states(states):
    try:
        with open(DB_FILE, "w") as f:
            json.dump(states, f, indent=4)
    except Exception as e:
        print("Error saving to db.json:", e)

# In-memory OTP store (email -> OTP code)
otp_store = {}

# Helper function to send email OTP
def send_email_otp(receiver_email: str, otp_code: str):
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print("⚠️ [EMAIL SERVICE] SENDER_EMAIL or SENDER_PASSWORD is not configured in .env!")
        return False

    message = MIMEMultipart()
    message["From"] = SENDER_EMAIL
    message["To"] = receiver_email
    message["Subject"] = "Your Flowbuilder Verification Code"

    body = f"""Hello,

Your Flowbuilder verification OTP code is: {otp_code}

Please enter this 6-digit code in the login screen to verify your email.

Best regards,
Flowbuilder AI Team"""
    
    message.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, receiver_email, message.as_string())
        server.quit()
        print(f"📧 [EMAIL SERVICE] OTP successfully sent to {receiver_email}!")
        return True
    except Exception as e:
        print(f"❌ [EMAIL SERVICE] Error sending OTP to {receiver_email}: {e}")
        return False

#SYSTEM PROMPT
SYSTEM_PROMPT_JD_CODING="""
   You are an ai helpfull assitant you will be given JD (job description) you have to return best email ( subject + body) for sending for refferal request
"""

SYSTEM_PROMPT_Resume_Reviewer="""
   You are an ai helpfull assitant you will be given Resume you have to return your overall opinion which area he can improve 
"""

SYSTEM_PROMPT_Cover_Letter="""
   You are an ai helpfull assitant you will be given Job description  you have to return your the cover letter  
"""

SYSTEM_PROMPT_Important_Questions="""
   You are an expert educational AI assistant. You will be given content from a book or study material.
   Extract and list the most important questions a student should be able to answer after studying this material.
   Format your response as a numbered list of clear, concise questions. Focus on key concepts, definitions,
   and critical thinking questions that test deep understanding.
"""

SYSTEM_PROMPT_MCQ_Generator="""
   You are an expert quiz creator. You will be given study material or a topic.
   Generate 10 well-crafted multiple choice questions (MCQs) with 4 options each (A, B, C, D).
   Mark the correct answer clearly. Make the distractors plausible to test real understanding.
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

# take JD query and return best subject and body for referral email 
def Email_Suggest(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_JD_CODING},
                    {"role":"user","content":state.query}
                ]
            )
      print("respo",response)
      state.subject=response.subject
      state.body=response.body
      return state

# take Resume and send the opinion 
def Resume_Reviewer(state):
      
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      resume_content = state.Resume if state.Resume else state.query
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Resume_Reviewer},
                    {"role":"user","content":resume_content}
                ]
            )
      print("respo",response)
      state.Ai_Response=response.Ai_Response
      return state

# Important Questions from book/PDF text
def Important_Questions(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      content = state.book_text if state.book_text else state.query
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Important_Questions},
                    {"role":"user","content":content}
                ]
            )
      print("Important_Questions respo",response)
      state.questions=response.questions
      state.Ai_Response=response.questions
      return state

# MCQ Generator
def MCQ_Generator(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      content = state.book_text if state.book_text else state.query
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_MCQ_Generator},
                    {"role":"user","content":content}
                ]
            )
      print("MCQ_Generator respo",response)
      state.mcqs=response.mcqs
      state.Ai_Response=response.mcqs
      return state

# Study Planner
def Study_Planner(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Study_Planner},
                    {"role":"user","content":state.query}
                ]
            )
      print("Study_Planner respo",response)
      state.study_plan=response.study_plan
      state.Ai_Response=response.study_plan
      return state

# cover letter Gen
def Cover_Letter(state):
      structured_llm = coding_llm_model.with_structured_output(messageStates)
      response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_Cover_Letter},
                    {"role":"user","content":state.query}
                ]
            )
      print("respo",response)
      state.Ai_Response=response.Ai_Response
      return state


# mail to user 
def mail_to_user(state):
    receiver_email = state.email

    if not SENDER_EMAIL or not SENDER_PASSWORD:
        print("⚠️ [EMAIL SERVICE] SENDER_EMAIL or SENDER_PASSWORD is not configured in .env!")
        return state

    # Create message
    message = MIMEMultipart()
    message["From"] = SENDER_EMAIL
    message["To"] = receiver_email
    username = receiver_email.split('@')[0]
    message["Subject"] = f"{state.subject} (on behalf of {username})"

    body = state.body
    message.attach(MIMEText(body, "plain"))

    # Connect to Gmail SMTP
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()

    # Login using env credentials
    server.login(SENDER_EMAIL, SENDER_PASSWORD)

    # Send email
    server.sendmail(SENDER_EMAIL, receiver_email, message.as_string())
    print("email sent")
    return state

#mapping 
mapping = {
     "1":Email_Suggest.__name__,
     "2":mail_to_user.__name__,
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
      graph.add_node(Email_Suggest)
      graph.add_node(mail_to_user)
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
      print("result",result)
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
    
    # Console output for testing retrieval (fallback)
    print("\n" + "="*50)
    print(f"🔑 [OTP SERVICE] Code for {email} is: {otp} (Email Sent: {email_sent})")
    print("="*50 + "\n")
    
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
