import { Mistral } from "@mistralai/mistralai"; 

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY }); 

console.log("Testing Codestral API behavior...");

// Test with different model versions
const models = ["codestral-embed", "mistral-embed"];

for (const model of models) {
    try {
        console.log(`\nTesting model: ${model}`);
        
        // Test without output_dimension
        const responseDefault = await client.embeddings.create({ 
            model: model, 
            inputs: ["test default"]
        });
        console.log(`${model} (default) - Dimensions:`, responseDefault.data[0].embedding.length);
        
        // Test with output_dimension: 3072
        const response3072 = await client.embeddings.create({ 
            model: model, 
            inputs: ["test 3072"], 
            output_dimension: 3072 
        });
        console.log(`${model} (3072) - Dimensions:`, response3072.data[0].embedding.length);
        
    } catch (e) {
        console.log(`${model} - ERROR:`, e.message);
    }
}