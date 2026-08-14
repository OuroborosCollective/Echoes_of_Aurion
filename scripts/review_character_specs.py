import os
from pathlib import Path
from google import genai

specification = Path("guardian/aurion_character_production_spec.md").read_text(encoding="utf-8")
prompt = """You are a senior real-time character technical artist. Review the following two production briefs for a Babylon.js browser game and Android fallback. Return concise JSON only with keys: approved (boolean), risks (array of strings), precise_prompt_fixes (array of strings), pipeline_checks (array of strings). Reject only if the briefs would likely fail biped rigging, exceed a 16 MiB GLB guardrail, or be unsuitable for two clearly distinct selectable player avatars. Do not suggest generating more than two models.\n\n""" + specification
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
response = client.models.generate_content(model="gemini-3.1-flash-lite", contents=prompt)
print(response.text)
