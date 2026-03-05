import os
import pickle
from dotenv import load_dotenv

# --- IMPORT LIBRARY ---
from langchain.chains import RetrievalQA
from langchain_community.document_loaders import PyPDFDirectoryLoader, DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

# --- IMPORT RETRIEVER RINGAN (BM25) ---
from langchain_community.retrievers import BM25Retriever

load_dotenv()
my_api_key = os.getenv("GEMINI_API_KEY")

class RagService:
    def __init__(self):
        self.qa_chain = None
        self.retriever = None
        
        # 1. SETUP MODEL CHAT (Gemini)
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash", 
            temperature=0.3,
            google_api_key=my_api_key
        )
        
        # 2. LOAD / BUILD DATABASE DENGAN SISTEM ANTI-CRASH (Try-Except)
        if os.path.exists("bm25_db.pkl"):
            print("📂 File database BM25 ditemukan. Mencoba memuat...")
            try:
                with open("bm25_db.pkl", "rb") as f:
                    self.retriever = pickle.load(f)
                print("✅ Sukses memuat database BM25 lama.")
                self.create_qa_chain()
            except Exception as e:
                # JIKA GAGAL (karena beda versi), LANGSUNG BUAT BARU
                print(f"⚠️ Gagal memuat BM25 lama (Kemungkinan beda versi library). Error: {e}")
                print("⚙️ Membangun ulang database baru...")
                self.build_index()
        else:
            print("⚙️ Database belum ada. Membangun baru (Cepat)...")
            self.build_index()

    def build_index(self):
        """
        Fungsi ini membangun database TANPA INTERNET (kecuali buat load library).
        Murni pakai CPU. Sangat cepat.
        """
        print("🔄 Membaca data wayang...")
        pdf_loader = PyPDFDirectoryLoader("data_wayang/")
        txt_loader = DirectoryLoader("data_wayang/", glob="*.txt", loader_cls=TextLoader)
        
        documents = []
        try:
            documents.extend(pdf_loader.load())
            documents.extend(txt_loader.load())
        except Exception as e:
            print(f"⚠️ Peringatan saat membaca dokumen: {e}")

        if not documents:
            print("❌ Data Kosong! Pastikan folder 'data_wayang' terisi.")
            return

        # Pecah Data
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
        chunks = text_splitter.split_documents(documents)
        print(f"📊 Total Data: {len(chunks)} chunks.")

        # --- BAGIAN AJAIB (BM25) ---
        self.retriever = BM25Retriever.from_documents(chunks)
        self.retriever.k = 3  # Ambil 3 data teratas yang mirip
        
        # Simpan ke file biar besok gak perlu build lagi
        with open("bm25_db.pkl", "wb") as f:
            pickle.dump(self.retriever, f)
            
        print("✅ SUKSES! Database BM25 versi terbaru berhasil dibuat.")
        self.create_qa_chain()

    def create_qa_chain(self):
        prompt_template = """
        Kamu adalah Asisten Pintar bernama "Cepot" yang ahli tentang budaya Wayang.
        Jawab pertanyaan berdasarkan konteks berikut ini. Jika jawaban tidak ada di konteks,
        katakan "Maaf, Cepot belum mempelajari hal itu di kitab data wayang.
        jika user tanya ini aplikasi apa, jawab ini aplikasi wayanusa dan jelaskan singkat."
        
        Konteks:
        {context}

        Pertanyaan: {question}
        """
        PROMPT = PromptTemplate(template=prompt_template, input_variables=["context", "question"])

        self.qa_chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            chain_type="stuff",
            retriever=self.retriever,
            return_source_documents=False,
            chain_type_kwargs={"prompt": PROMPT}
        )
        print("✅ Sistem Chatbot Siap Digunakan!")

    def get_answer(self, query):
        if not self.qa_chain:
            return "⚠️ Database error."
        try:
            result = self.qa_chain.invoke({"query": query})
            return result.get("result", "Error.")
        except Exception as e:
            return f"Maaf, error: {str(e)}"

# Singleton
rag_service = RagService()