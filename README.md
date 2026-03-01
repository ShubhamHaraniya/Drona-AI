# Drona AI - Comprehensive Project Explanation

## 1. Brief about the idea / What is your Idea about?
**Drona AI** is an advanced, fully autonomous AI-powered Adaptive Learning Management System (LMS) engineered explicitly for the modern higher-education landscape. Named after the legendary teacher Dronacharya, it acts as a hyper-intelligent, 24/7 personalized mentor that dynamically adapts its curriculum generation to the exact cognitive pace, strengths, and weaknesses of the individual student.

At its core, Drona AI deviates from traditional static content delivery. Instead of serving pre-authored textbooks or hard-coded quiz banks, it employs a sophisticated **Multi-Agent Large Language Model (LLM) orchestration architecture** powered by Llama 3.3. When a student interacts with Drona AI—whether they are asking to learn about *Backpropagation* or requesting an exam schedule—their input is parsed by an intelligent semantic router. This router dispatches the request to a specific autonomous agent (Query, Quiz, Evaluation, or Scheduler). Every single response, explanation, multiple-choice question, and analytical breakdown algorithmically generated in real-time. This creates an infinitely scalable tutoring environment where no two students experience the exact same learning pathway, guaranteeing true 1:1 mentorship for core computer science domains like Machine Learning, Data Structures & Algorithms, and Database Systems.

## 2. What problem are you trying to solve?
The contemporary education system and legacy LMS platforms (such as Canvas, Blackboard, or Moodle) suffer dramatically from a **systemic one-size-fits-all approach**.
* **Static Assessment Bottlenecks:** Students across the globe receive the exact same static quizzes regardless of whether they have mastered the material or are struggling. Once a student memorizes the quiz bank, the assessment loses all pedagogical value.
* **Delayed Feedback Loops:** When students encounter conceptual roadblocks during late-night study sessions, they are forced to wait days for office hours or rely on generic external forums like StackOverflow, which lack the specific context of their university curriculum.
* **Superficial Academic Analytics:** Traditional grading provides a single, opaque numerical score (e.g., "75/100"). This lacks granularity. A student doesn't know *why* they got a 75. They don't know if they failed because they struggle with "Foreign Keys" or "B+ Trees".
* **Fragmented Study Planning:** Students possess raw data about their exams but lack the executive function to map out an effective study plan. Creating daily study blocks targeted exclusively at their weakest academic nodes is left entirely as a manual, overwhelming exercise.

## 3. How different is it from any of the other existing ideas? / USP of the proposed solution
Drona AI introduces several **Unique Selling Propositions (USPs)** that fundamentally differentiate it from existing ed-tech solutions and standard AI wrappers:

1. **Infinite Adaptive Generation (Zero Static Data):** Most existing platforms rely on human educators to write 100 questions per topic. Drona AI uses its *Quiz Agent* to synthetically generate infinite, unique variations of multiple-choice questions in real-time. It calibrates the complexity based on the student's historic performance (adaptive difficulty routing).
2. **Orchestrated Multi-Agent Architecture:** Rather than dumping all prompts into a single chat window, Drona AI utilizes a specialized ecosystem. The *Router Agent* mathematically categorizes the intent. The *Query Agent* executes Retrieval-Augmented Generation (RAG) against a verified vector database. The *Evaluation Agent* strictly grades submissions against LLM-generated answer keys. This separation of concerns prevents LLM hallucinations and ensures deterministic, academic accuracy.
3. **Hyper-Granular Micro-Analytics:** Drona AI breaks down broad subjects ("Database Systems") into micro-topics ("Normalization", "Concurrency Control"). It tracks mastery percentages for each micro-topic. Upon request, it streams an AI-formulated daily study plan that intelligently targets *only* the micro-topics where the student scores below 60%.
4. **Seamless Conversational Infrastructure:** The UI blurring the lines between a dashboard and a chatbot. Students do not navigate clunky menus to set calendar events. They simply type *"I have an ML quiz next Friday at 10 AM,"* and the *Scheduler Agent* seamlessly extracts the datetime footprint and injects it into the database.

## 4. How will it be able to solve the problem? / Impact of your solution
Drona AI bridges the gap between mass education and private tutoring. By providing **infinite scaling for high-fidelity personalized intervention**, it creates a profound impact across the academic ecosystem:
* **Micro-Impact (The Student):** Drastically reduces study anxiety and cognitive overload. When a student logs in, they are immediately presented with a dynamically generated roadmap focusing strictly on their algorithmic weaknesses. Immediate, RAG-backed explanations resolve logical roadblocks in seconds, keeping the student continually in a "flow state" of learning.
* **Macro-Impact (The Institution):** Radically liberates faculty. Educators are freed from the grueling administrative burden of manually authoring hundreds of syllabus-aligned quiz questions or repeatedly answering identical conceptual doubts via email. This allows universities to redeploy faculty bandwidth toward high-level mentoring, advanced research, and practical thesis guidance.

## 5. List of features offered by the solution
* **Autonomous Semantic Router:** A hidden intent-classifier that intelligently reads natural language and routes it to the correct backend computational agent.
* **RAG-Powered Explanations:** Uses TF-IDF vector similarity search against verified collegiate PDFs and knowledge bases to ground all AI explanations in academic truth, preventing hallucination.
* **Real-Time Dynamic Quiz Engine:** Generates syllabus-aligned MCQs on-the-fly, adjusting vocabulary and conceptual depth based on the student's `adaptiveDifficultyLevel`.
* **Deep-Dive Quiz Evaluation:** Does not just provide a binary Pass/Fail. The AI analyzes *why* the student's chosen answer was incorrect and writes a personalized micro-explanation for every single mistake.
* **Subject-Specific Analytics Isolation:** Dedicated algorithmic dashboards that isolate College Grades, Recent Quizzes, and Topic Mastery for individual subjects, culminating in a 3-paragraph AI-generated future study plan.
* **Conversational Calendar API:** Natural language temporal parsing that detects events, assignments, and deadlines purely from casual chat messages.
* **Agnostic LLM Client architecture:** A flexible backend that allows instant swapping of the intelligence engine between Groq (Llama 3), OpenAI (GPT-4o), or local bare-metal Ollama deployments via simple environment variable toggles.

## 6. Process flow diagram or Use-case diagram
**Core Algorithmic Flow for Assessment:**
1. **Trigger:** The student inputs a natural language command (e.g., *"Test me on Machine Learning concepts"*).
2. **Intent Classification:** The message hits `/api/chat`. The **Router Agent** analyzes the linguistics, identifies the `QuizRequest` intent, and extracts parameters `[subject: "Machine Learning"]`.
3. **Context Gathering:** The backend queries the SQLite database to fetch the student's historic performance to determine their `adaptiveDifficultyLevel` (e.g., "Intermediate").
4. **Generation:** The **Quiz Agent** generates a secure JSON payload containing 5 unique, intermediate-level MCQs. The UI renders this payload into interactive cards.
5. **Execution & Submission:** The student completes the quiz. The payload of their selected answers is posted to `/api/quiz/submit`.
6. **AI Evaluation:** The **Evaluation Agent** receives the student's answers juxtaposed against the AI's hidden answer key. It computes the percentage, identifies which micro-topics were failed, and updates the database mastery metrics.
7. **Feedback Loop:** The student receives an instant breakdown of their errors, and the global Subject Analytics dashboard is automatically re-calibrated.

## 7. Architecture diagram of the proposed solution
```text
[ Client Layer (Next.js 15 App Router / Glassmorphism UI) ]
         │ (HTTP POST with JSON Payloads)
         ▼
[ API Orchestration Layer (/api/chat & /api/quiz) ]
         │
         ▼
[ Router Agent (LLM classification engine) ] ───▶ Determines execution path
         │
         ├─▶ [ Query Agent ] ──▶ [ TF-IDF Vector Search ] ──▶ [ PDF Knowledge Base ]
         │                  (Retrieval Augmented Generation)
         │
         ├─▶ [ Quiz Agent ] ──▶ Automatically scales difficulty via context
         │
         ├─▶ [ Scheduler Agent ] ──▶ Temporal Datetime Parsing
         │
         └─▶ [ Evaluation Agent ] ──▶ Generates deep-dive analytical feedback
         │
         ▼
[ Provider-Agnostic LLM Engine (Groq Llama 3.3 70B / OpenAI / Local Ollama) ]
         │
         ▼
[ Data Persistence Layer (SQLite Database managed via Prisma ORM) ]
```

## 8. Technologies to be used in the solution
* **Frontend Rendering & API:** Next.js 15 (React 19) utilizing the App Router architecture for seamless full-stack integration.
* **Styling:** Custom CSS3 implementing an ultra-premium "Deep Dark" glassmorphism aesthetic, prioritizing UX psychology and reduced eye-strain.
* **Language:** TypeScript (Strict mode) ensuring full end-to-end type safety between the LLM JSON outputs and the frontend UI components.
* **Intelligence / Inference Engine:** Groq API running the `llama-3.3-70b-versatile` open-source model prioritizing extreme speed and low latency.
* **Database & ORM:** SQLite database strictly managed and migrated via the Prisma ORM.
* **Authentication:** NextAuth.js configured for robust role-based access control (Student vs. Teacher views).
* **Search / Retrieval:** Custom built lightweight TF-IDF (Term Frequency-Inverse Document Frequency) vectorizer utilizing cosine similarity for high-speed local document retrieval without expensive cloud vector databases.

## 9. Usage of AMD Products/Solutions
Drona AI represents a massive computational workload that is perfectly aligned to be heavily optimized and accelerated across the **AMD AI hardware ecosystem**. To transition Drona AI from a cloud-dependent prototype into a secure, sovereign, low-latency enterprise solution for universities, the following AMD integrations are proposed:

1. **AMD Instinct™ MI300X Accelerators for Sovereign Cloud:**
   Currently, the heavy lifting of the Multi-Agent LLM architecture is outsourced to Groq APIs. To protect student data privacy (FERPA compliance) and ensure constant uptime, universities can deploy the Llama 3.3 70B model entirely *on-premise* using AMD Instinct MI300X GPUs. The industry-leading 192 GB of HBM3 memory bandwidth on the MI300X allows the massive 70-billion parameter model to run locally with ultra-high throughput and minimal latency. This means thousands of students can simultaneously request real-time quizzes without the university paying exorbitant token fees to third-party API providers.

2. **AMD ROCm™ Software Ecosystem for Frictionless Deployment:**
   To deploy these advanced open-source foundational models (like Llama 3.3) locally on AMD Instinct hardware, the Drona AI backend will heavily leverage the **AMD ROCm™ open software platform**. Because ROCm provides completely seamless, native, out-of-the-box support for industry-standard frameworks like PyTorch and highly optimized inference servers like **vLLM**, porting the current LLM codebase to run entirely on AMD architecture requires zero specialized refactoring. The LMS will benefit from highly optimized attention mechanisms natively accelerated by ROCm.

3. **AMD Ryzen™ AI Processors for Edge Offloading:**
   For students running the Drona AI web application locally on laptops equipped with **AMD Ryzen™ AI processors**, the system can utilize the integrated NPU (Neural Processing Unit). We can offload lightweight semantic tasks—such as the initial *Router Agent* intent classification or local TF-IDF vector similarity searches—directly to the edge device. By executing these smaller mathematical tasks natively on the AMD NPU, we drastically reduce server-side API round-trips, completely eliminate network latency constraints for basic UI routing, and drastically improve battery life for the student's machine compared to running inference on their standard CPU.

## 10. Estimated implementation cost (optional)
*Assuming a high-scale deployment targeting an internal university cluster of 5,000+ students:*
* **Capital Expenditure (Hardware):** Acquisition of bare-metal servers equipped with AMD Instinct MI300X accelerators to run Llama 3 on-premise, bypassing lifetime API token costs entirely.
* **Cloud Infrastructure (Frontend):** $200 - $500/month for scalable Vercel/AWS instances hosting the Next.js App Router and Edge APIs.
* **Database Services:** $150/month for scalable PostgreSQL/MySQL managed instances handling millions of daily relational records (mastery scores, log events).
* **Human Capital:** ~2-3 specialized Full-Stack AI Engineers focusing on continuous prompt-tuning, RAG vector pipeline optimization via PyTorch/ROCm, and UX refinements.

---

## 🚀 Setup & Run (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Set up database
npx prisma generate
npx prisma db push

# 3. Configure .env (already pre-configured with Groq)
# Edit .env to change LLM provider if needed

# 4. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Sign up → Start chatting!
