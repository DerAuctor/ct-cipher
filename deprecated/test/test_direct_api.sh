#!/bin/bash

echo "Testing Mistral API directly with different parameters..."

echo "Test 1: Default parameters"
curl -X POST "https://api.mistral.ai/v1/embeddings" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
     -d '{"model": "codestral-embed", "inputs": ["test default"]}' 2>/dev/null | jq '.data[0].embedding | length'

echo "Test 2: With output_dimension 3072"
curl -X POST "https://api.mistral.ai/v1/embeddings" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
     -d '{"model": "codestral-embed", "inputs": ["test 3072"], "output_dimension": 3072}' 2>/dev/null | jq '.data[0].embedding | length'

echo "Test 3: With output_dimension 2048"
curl -X POST "https://api.mistral.ai/v1/embeddings" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer ${MISTRAL_API_KEY}" \
     -d '{"model": "codestral-embed", "inputs": ["test 2048"], "output_dimension": 2048}' 2>/dev/null | jq '.data[0].embedding | length'