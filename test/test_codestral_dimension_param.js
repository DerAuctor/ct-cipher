import { Mistral } from "@mistralai/mistralai"; 

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY }); 

console.log("Testing different output_dimension values...");

// Test 1536 (default)
try {
    const response1536 = await client.embeddings.create({ 
        model: "codestral-embed", 
        inputs: ["test"], 
        output_dimension: 1536 
    });
    console.log("1536 dimensions - SUCCESS:", response1536.data[0].embedding.length);
} catch (e) {
    console.log("1536 dimensions - ERROR:", e.message);
}

// Test 3072 (maximum)
try {
    const response3072 = await client.embeddings.create({ 
        model: "codestral-embed", 
        inputs: ["test"], 
        output_dimension: 3072 
    });
    console.log("3072 dimensions - SUCCESS:", response3072.data[0].embedding.length);
} catch (e) {
    console.log("3072 dimensions - ERROR:", e.message);
}

// Test 2048 (intermediate)
try {
    const response2048 = await client.embeddings.create({ 
        model: "codestral-embed", 
        inputs: ["test"], 
        output_dimension: 2048 
    });
    console.log("2048 dimensions - SUCCESS:", response2048.data[0].embedding.length);
} catch (e) {
    console.log("2048 dimensions - ERROR:", e.message);
}