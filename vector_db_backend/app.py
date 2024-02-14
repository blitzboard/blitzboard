
from flask import Flask, send_file, request
import json
from flask import render_template
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS


load_dotenv()

app = Flask(__name__, template_folder='templates')

vector_db_path = os.getenv("VECTOR_STORE", "vector_store.faiss")

# POST: /register_article
# data format:
# {
# 	"graphId": 1,
# 	"article": <記事の内容>,
#   "words": [ 
#     <単語群>
#   ]
# }
@app.route('/register_article', methods=['POST'])
def register_article():
    data = request.get_json()
    # Register article to vector store with FAISS
    # 1. Get article from data
    article = data['article']
    # 2. Get words from data
    words = data['words']
    # 3. Get graphId from data
    graphId = data['graphId']
    # 4. Save article to local file

    # 5. Get embedding model
    # 6. Create vector store
    # 7. Save vector store
    # 8. Return status


    return json.dumps({"status": "ok"})


if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True)
