# ==============================================================================
# UN-SLOTH QLORA FINE-TUNING SCRIPT FOR JOB FORM FILLING MODEL
# Copy and paste this ENTIRE block into a single Google Colab cell (T4 GPU)
# ==============================================================================

# Step 1: Install Dependencies
!pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git" trl datasets

import os
import json
import torch
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

# Step 2: Auto-generate sample dataset if dataset.jsonl does not exist
if not os.path.exists("dataset.jsonl"):
    print("Creating sample dataset.jsonl...")
    sample_data = [
        {
            "messages": [
                {"role": "system", "content": "You are an autonomous AI job application assistant. Given a candidate's profile context and a list of job form fields, output a valid JSON object mapping each field selector to its exact answer."},
                {"role": "user", "content": "Candidate Profile:\n- Name: Test User\n- Experience: 5 years Python\n\nJob Form Fields:\n1. id: #exp_python, type: text, label: \"Years of Python experience\""},
                {"role": "assistant", "content": "{\"#exp_python\": \"5\"}"}
            ]
        }
    ]
    with open("dataset.jsonl", "w") as f:
        for item in sample_data:
            f.write(json.dumps(item) + "\n")

# Step 3: Model Setup (Qwen2.5 7B Instruct with 4-bit Quantization)
max_seq_length = 2048
dtype = None # Auto detection
load_in_4bit = True

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/Qwen2.5-7B-Instruct",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# Step 4: Add LoRA Adapters
model = FastLanguageModel.get_peft_model(
    model,
    r = 16,
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha = 16,
    lora_dropout = 0,
    bias = "none",
    use_gradient_checkpointing = "unsloth",
    random_state = 3407,
)

# Step 5: Format ChatML Dataset
def format_prompts(examples):
    texts = []
    for messages in examples["messages"]:
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        texts.append(text)
    return {"text": texts}

dataset = load_dataset("json", data_files="dataset.jsonl", split="train")
dataset = dataset.map(format_prompts, batched=True)

# Step 6: Train Model
trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 2,
    packing = False,
    args = SFTConfig(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60,
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 1,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
    ),
)

trainer_stats = trainer.train()

# Step 7: Export directly to 4-bit GGUF format for Ollama!
model.save_pretrained_gguf("job_form_filler_gguf", tokenizer, quantization_method = "q4_k_m")

print("\n✅ SUCCESS! GGUF exported to: job_form_filler_gguf/job_form_filler_q4_k_m.gguf")

# Step 8: Automatically download the GGUF file to your computer
from google.colab import files
files.download("job_form_filler_gguf/job_form_filler_q4_k_m.gguf")


