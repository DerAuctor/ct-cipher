# Cipher Code Style and Conventions

## TypeScript Style
- **ESM modules**: Use `import/export` syntax
- **Strict TypeScript**: Enable strict type checking
- **Interface naming**: Use PascalCase for interfaces
- **Enum naming**: Use PascalCase for enums  
- **Function naming**: Use camelCase
- **Class naming**: Use PascalCase

## Code Organization
- **Core logic**: Place in `src/core/`
- **Application**: CLI and servers in `src/app/`
- **Types**: Co-locate with implementations or in dedicated type files
- **Utilities**: Common utilities in appropriate core modules

## Import/Export Style
```typescript
// Prefer named exports
export { SomeClass, SomeFunction }

// Use relative imports for local files
import { Logger } from './logger'

// Use absolute imports for external packages
import { openai } from 'openai'
```

## Error Handling
- Use structured logging with winston
- Implement proper error boundaries
- Return meaningful error messages
- Use try-catch for async operations

## Documentation
- Use JSDoc comments for public APIs
- Include parameter descriptions
- Document return types
- Add usage examples for complex functions

## Testing Patterns
- Unit tests alongside source files
- Integration tests in separate directory
- Mock external dependencies
- Test both success and error cases