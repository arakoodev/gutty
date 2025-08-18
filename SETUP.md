# Gutty Setup Guide

## 1. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Update the following required variables in `.env`:

### **Vertex AI (Required)**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
VERTEX_PROJECT_ID=your-gcp-project-id
VERTEX_LOCATION=us-central1
```

### **USDA FoodData Central (Required for nutrition)**
```bash
FDC_API_KEY=your-fdc-api-key
```

Get your FDC API key at: https://fdc.nal.usda.gov/api-key-signup.html

## 2. Google Cloud Service Account

### Create Service Account:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to **IAM & Admin** → **Service Accounts**
4. Click **Create Service Account**
5. Name: `gutty-service-account`
6. Grant these roles:
   - **Vertex AI User**
   - **AI Platform Developer** 
   - **Storage Object Viewer** (if using GCS)

### Generate Key:
1. Click on your service account
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Download and save as `service-account.json`

### Sample Service Account JSON:
```json
{
  "type": "service_account",
  "project_id": "your-gcp-project-id",
  "private_key_id": "abcdef1234567890...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n[CONTENT]\n-----END PRIVATE KEY-----\n",
  "client_email": "gutty-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/gutty-service-account%40your-project.iam.gserviceaccount.com"
}
```

## 3. Enable Required APIs

Enable these APIs in your Google Cloud project:
```bash
gcloud services enable aiplatform.googleapis.com
gcloud services enable ml.googleapis.com
gcloud services enable compute.googleapis.com
```

Or via Cloud Console → **APIs & Services** → **Library**:
- Vertex AI API
- AI Platform API
- Compute Engine API

## 4. Verification

Test your setup:
```bash
npx gutty validate
```

This command verifies:
- ✅ Service account authentication
- ✅ Vertex AI API access
- ✅ Model availability
- ✅ FDC API connection

## 5. Optional: HuggingFace Token

For automatic dataset downloads, get a HF token:
1. Go to https://huggingface.co/settings/tokens
2. Create a **Read** token
3. Add to `.env`:
```bash
HF_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 6. Troubleshooting

### Authentication Error:
```
Error: Could not load the default credentials
```
**Fix**: Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to correct JSON file with absolute path.

### Permission Error:
```
Error: The caller does not have permission
```
**Fix**: Add **Vertex AI User** role to your service account.

### Model Not Found:
```
Error: Model multimodalembedding@001 not found
```
**Fix**: Ensure **Vertex AI API** is enabled and your project has access to Model Garden.

---

**Ready to go!** 🚀 Run `npx gutty health-analyze --image food.jpg --verticals pcos,ibs` to test the complete pipeline.