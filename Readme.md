## This is an Express Node backend Server Interngrated with Genkit AI Library
## Docker was used as a Production Environment to streamline the deployment process on Render

1. Node Express - index.js
2. Genkit - genkit.ts
3. tsconfig :
    - compiled genkit.ts into ./dist/genkit.ts
4. Express : index.js uses import from ./dist/genkit.ts
4. Dockerfile : 
    - Run index.js 
    - Deployed on Render


## Previous Issues Encoutered During Deployment:
    - Render Started the server at ./src : causing a directory issue 
    - genkit.ts was removed from .src folder and put in the root folder 
    - configured tsconfig.json to output the compiled .ts file to ./dist folder
    - Express read the genkit.ts exports from the compiled ./dist/genkit.ts
    - Issues Resolved + Deployment Success.