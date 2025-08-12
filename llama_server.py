from dotenv import load_dotenv
load_dotenv()

import os
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

HF_TOKEN = os.environ["HF_TOKEN"]
API_URL = "https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct"
headers = {"Authorization": f"Bearer {HF_TOKEN}"}

@app.route('/generate', methods=['POST'])
def generate():
    prompt = request.json['prompt']
    data = {"inputs": prompt}
    response = requests.post(API_URL, headers=headers, json=data)
    answer = response.json().get('generated_text', '')
    return jsonify(answer=answer)

if __name__ == '__main__':
    app.run(port=int(os.environ.get("LLAMA_PORT", 5002)), host="0.0.0.0")