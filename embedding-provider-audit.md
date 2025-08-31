# Embedding Provider Environment Variable Audit

## 🜄 Ziel 🜄
Systematische Dokumentation aller verfügbaren Environment-Variablen für Embedding-Provider und Identifikation der Konfigurationslücken im Cipher AI Agent Framework.

## 🜄 Kontext 🜄
parseEmbeddingConfigFromEnv() gibt null zurück, weil keine geeigneten Environment-Variablen für Embedding-Provider konfiguriert sind. Analyse basiert auf src/core/brain/embedding/config.ts:155-221.

## Environment Variables Audit

### ✅ Currently Available
| Provider | Environment Variable | Status | Value |
|----------|---------------------|--------|--------|
| Codestral/Mistral | `MISTRAL_API_KEY` | ✅ SET | JsdFyEDC... |

### ❌ Not Configured  
| Provider | Primary Variable | Secondary Variables | Status |
|----------|-----------------|-------------------|--------|
| OpenAI | `OPENAI_API_KEY` | `OPENAI_BASE_URL`, `OPENAI_EMBEDDING_MODEL` | ❌ NOT SET |
| Gemini | `GEMINI_API_KEY` | `GEMINI_BASE_URL`, `GEMINI_EMBEDDING_MODEL` | ❌ NOT SET |
| Qwen | `QWEN_API_KEY` | `DASHSCOPE_API_KEY`, `QWEN_BASE_URL` | ❌ NOT SET |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` | `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` | ❌ NOT SET |
| Ollama | `OLLAMA_BASE_URL` | `OLLAMA_EMBEDDING_MODEL` | ❌ NOT SET |
| LM Studio | `LMSTUDIO_BASE_URL` | `LMSTUDIO_EMBEDDING_MODEL` | ❌ NOT SET |
| Voyage | `VOYAGE_API_KEY` | - | ❌ NOT SET |

## Priority Order Analysis

parseEmbeddingConfigFromEnv() verwendet folgende Prioritätsreihenfolge:

1. **OpenAI** (OPENAI_API_KEY) ❌
2. **Gemini** (GEMINI_API_KEY) ❌  
3. **Qwen** (QWEN_API_KEY || DASHSCOPE_API_KEY) ❌
4. **AWS Bedrock** (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) ❌
5. **Ollama** (OLLAMA_BASE_URL) ❌
6. **LM Studio** (LMSTUDIO_BASE_URL) ❌
7. **Codestral/Mistral** (MISTRAL_API_KEY) ✅ **AVAILABLE**

## 🜄 Root Cause 🜄
Obwohl MISTRAL_API_KEY verfügbar ist, wird parseEmbeddingConfigFromEnv() nicht korrekt aktiviert, da:

1. **Current Test Result**: parseEmbeddingConfigFromEnv() gibt null zurück trotz verfügbarem MISTRAL_API_KEY
2. **Expected Result**: Sollte Codestral-Konfiguration zurückgeben:
   ```json
   {
     "type": "codestral",
     "apiKey": "JsdFyEDC...",
     "baseUrl": process.env.MISTRAL_BASE_URL,
     "model": "codestral-embed"
   }
   ```

## 🜄 Immediate Action Required 🜄

### Solution 1: Environment Variable Setup
```bash
# Option A: Use existing Mistral key for embeddings  
export MISTRAL_API_KEY=JsdFyEDC...

# Option B: Set up Gemini embeddings
export GEMINI_API_KEY=<gemini-api-key>

# Option C: Set up OpenAI embeddings
export OPENAI_API_KEY=<openai-api-key>
```

### Solution 2: cipher.yml Configuration
```yaml
# Add to memAgent/cipher.yml
embedding:
  type: codestral
  apiKey: ${MISTRAL_API_KEY}
  model: codestral-embed
  baseUrl: https://api.mistral.ai
```

## 🜄 Related Files 🜄
- **src/core/brain/embedding/config.ts:155-221** - parseEmbeddingConfigFromEnv() implementation
- **memAgent/cipher.yml** - Agent configuration (needs embedding section)
- **.env.example** - Environment variable templates with embedding examples

## 🜄 Verification Criteria Met 🜄
- [x] Liste aller verfügbaren Environment-Variablen für Embedding-Provider erstellt
- [x] Dokumentation welche Provider aktiviert werden können  
- [x] Test von parseEmbeddingConfigFromEnv() zeigt konkreten Rückgabewert (null trotz MISTRAL_API_KEY)

## 🜄 Next Steps 🜄
1. Implementiere cipher.yml embedding-Konfiguration mit vorhandenem MISTRAL_API_KEY
2. Debug warum parseEmbeddingConfigFromEnv() trotz verfügbarem MISTRAL_API_KEY null zurückgibt
3. Teste Service-Initialisierung mit neuer Embedding-Konfiguration