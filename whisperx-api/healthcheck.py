import requests

response = requests.get(url="http://0.0.0.0:8000/health", timeout=30)
