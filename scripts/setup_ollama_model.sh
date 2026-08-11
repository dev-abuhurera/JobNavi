#!/usr/bin/env bash

# Setup local Ollama model 'job-filler' for autonomous form filling
set -e

# Use persistent user models directory instead of /tmp
export OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}"
mkdir -p "$OLLAMA_MODELS"

GGUF_FILE="$1"

if [ -z "$GGUF_FILE" ]; then
  if [ -f "qwen2.5-7b-instruct.Q4_K_M.gguf" ]; then
    GGUF_FILE="qwen2.5-7b-instruct.Q4_K_M.gguf"
  elif [ -f "lib/automation/qwen2.5-7b-instruct.Q4_K_M.gguf" ]; then
    GGUF_FILE="lib/automation/qwen2.5-7b-instruct.Q4_K_M.gguf"
  elif [ -f "$HOME/Downloads/qwen2.5-7b-instruct.Q4_K_M.gguf" ]; then
    GGUF_FILE="$HOME/Downloads/qwen2.5-7b-instruct.Q4_K_M.gguf"
  elif [ -f "job_form_filler_q4_k_m.gguf" ]; then
    GGUF_FILE="job_form_filler_q4_k_m.gguf"
  else
    GGUF_FILE=$(find . $HOME/Downloads -name "*.gguf" 2>/dev/null | head -n 1 || true)
  fi
fi

if [ -n "$GGUF_FILE" ] && [ -f "$GGUF_FILE" ]; then
  echo "Using local GGUF model file: $GGUF_FILE"
  FROM_SOURCE="./$GGUF_FILE"
else
  echo "No local .gguf file found. Using 'qwen2.5:1.5b' base model from Ollama registry..."
  FROM_SOURCE="qwen2.5:1.5b"
fi

echo "Creating Modelfile for Ollama..."
cat << EOF > Modelfile
FROM $FROM_SOURCE

SYSTEM """You are an autonomous AI job application assistant. Given a candidate's profile context and a list of job form fields, output a valid JSON object mapping each field selector to its exact answer."""

PARAMETER temperature 0.1
PARAMETER top_p 0.95
PARAMETER stop "<|im_end|>"
EOF

echo "Building Ollama model 'job-filler'..."
ollama create job-filler -f Modelfile

echo "Testing local model with Ollama..."
ollama run job-filler "Candidate Profile:
- Name: Test Candidate
- Role: Software Engineer
- Experience: 5 years
- Skills: Python (5 years)

Job Form Fields:
1. id: #q1, type: text, label: \"How many years of work experience do you have with Python?\""

echo "✅ Ollama model 'job-filler' is ready to use!"
