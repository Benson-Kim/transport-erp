# UI Components Design System

A comprehensive design system built with Tailwind CSS, providing consistent, accessible, and performant UI components.

## Design Principles

1. **Consistency**: All components follow the same design language
2. **Accessibility**: WCAG 2.1 AA compliant with proper ARIA attributes
3. **Performance**: Optimized for minimal re-renders and bundle size
4. **Flexibility**: Composable components that work together seamlessly
5. **Responsiveness**: Mobile-first approach with fluid layouts

## Design Tokens

Our design system is built on a foundation of design tokens that ensure consistency across all components.

### Colors

```typescript
import { tokens } from '@/lib/design-tokens';

// Primary colors
tokens.color('primary', 500); // Main brand color
tokens.color('primary', 600); // Hover state
tokens.color('primary', 700); // Active state

// Semantic colors
tokens.color('success', 500); // Success states
tokens.color('warning', 500); // Warning states
tokens.color('error', 500);   // Error states
tokens.color('info', 500);    // Information

// Neutral colors
tokens.color('neutral', 50);  // Lightest
tokens.color('neutral', 900); // Darkest
```

### Typography Scale

```typescript
// Font sizes with line heights
'xs': '0.75rem',   // 12px
'sm': '0.875rem',  // 14px
'base': '1rem',    // 16px
'lg': '1.125rem',  // 18px
'xl': '1.25rem',   // 20px
'2xl': '1.5rem',   // 24px
'3xl': '1.875rem', // 30px
'4xl': '2.25rem',  // 36px
'5xl': '3rem',     // 48px
```

### Spacing Scale

Based on 4px increments:

```typescript
tokens.spacing(1);  // 0.25rem (4px)
tokens.spacing(2);  // 0.5rem (8px)
tokens.spacing(4);  // 1rem (16px)
tokens.spacing(8);  // 2rem (32px)
tokens.spacing(16); // 4rem (64px)
```

## Component Categories

### Layout Components
- **Container**: Responsive max-width container  
- **Grid**: Flexible grid system with auto-fill/fit  
- **Stack**: Vertical/horizontal stacking with gaps  
- **Divider**: Visual separation between sections  

### Form Components
- **Input**: Text, email, password, number inputs  
- **TextArea**: Multi-line text input  
- **Select**: Dropdown selection  
- **Checkbox**: Single and grouped checkboxes  
- **Radio**: Radio button groups  
- **Switch**: Toggle switches  
- **DatePicker**: Date selection with calendar  
- **FileUpload**: File upload with drag-and-drop  

### Feedback Components
- **Alert**: Info, success, warning, error messages  
- **Toast**: Temporary notifications  
- **Modal**: Dialog overlays  
- **Popover**: Contextual information  
- **Tooltip**: Hover hints  
- **Progress**: Loading indicators  
- **Skeleton**: Loading placeholders  

### Navigation Components
- **Navbar**: Top navigation bar  
- **Sidebar**: Side navigation  
- **Tabs**: Tabbed content  
- **Breadcrumb**: Navigation path  
- **Pagination**: Page navigation  

### Data Display Components
- **Table**: Data tables with sorting/filtering  
- **Card**: Content containers  
- **Badge**: Status indicators  
- **Avatar**: User profile images  
- **List**: Organized data lists  

## Usage Examples

### Using the `cn()` utility
```typescript
import { cn } from '@/lib/utils/cn';

// Basic usage
<div className={cn('base-class', 'additional-class')} />

// Conditional classes
<button className={cn(
  'btn',
  isActive && 'btn-active',
  isDisabled && 'opacity-50 cursor-not-allowed'
)} />

// With arrays and objects
<div className={cn(
  ['base', 'classes'],
  {
    'active': isActive,
    'disabled': isDisabled,
  },
  customClassName
)} />
```

### Using design tokens
```typescript
import { tokens, responsive } from '@/lib/design-tokens';

// Get specific token values
const primaryColor = tokens.color('primary', 500);
const spacing = tokens.spacing(4);
const shadow = tokens.shadow('lg');

// Responsive utilities
const responsiveClasses = responsive.classes(
  'p-4',
  {
    sm: 'p-6',
    md: 'p-8',
    lg: 'p-10',
  }
);
// Result: 'p-4 sm:p-6 md:p-8 lg:p-10'
```

### WCAG Color Contrast
```typescript
import { wcag } from '@/lib/design-tokens';

// Check contrast ratio
const ratio = wcag.contrastRatio('#3b82f6', '#ffffff');
console.log(ratio); // 4.54

// Check WCAG compliance
const meetsAA = wcag.meetsAA('#3b82f6', '#ffffff', 'normal');
console.log(meetsAA); // true

// Get best text color for background
const textColor = wcag.getTextColor('#3b82f6');
console.log(textColor); // '#ffffff'
```

## Common Patterns

### Card with hover effect
```jsx
<div className={cn(
  'card',
  'hover-lift',
  'transition-shadow hover:shadow-lg'
)}>
  <div className="card-header">
    <h3 className="card-title">Title</h3>
    <p className="card-description">Description</p>
  </div>
  <div className="card-content">
    Content
  </div>
</div>
```

### Form field with validation
```jsx
<div className="space-y-2">
  <label className="label" htmlFor="email">
    Email
  </label>
  <input
    id="email"
    className={cn(
      'input',
      errors.email && 'border-error-500 focus:ring-error-500'
    )}
    type="email"
  />
  {errors.email && (
    <p className="text-sm text-error-600">
      {errors.email.message}
    </p>
  )}
</div>
```

## Component API Standards

All components follow these standards:

- **Props Interface**: Clearly typed props with JSDoc  
- **Ref Forwarding**: Support for React refs  
- **Accessibility**: Proper ARIA attributes  
- **Keyboard Navigation**: Full keyboard support  
- **Theming**: Support for light/dark modes  
- **Composition**: Can be composed with other components  

### Example component structure
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
```

## Performance Guidelines

- Use `cn()` for class merging  
- Memoize expensive computations (`React.memo`, `useMemo`)  
- Lazy load heavy components (dynamic imports)  
- Optimize images with Next.js `<Image />`  
- Minimize re-renders with stable keys/dependencies  

## Accessibility Checklist

- Keyboard navigation works correctly  
- Screen reader announcements are clear  
- Focus indicators are visible  
- Color contrast meets WCAG AA (4.5:1)  
- Interactive elements have proper ARIA labels  
- Error messages are associated with inputs  
- Loading states are announced  
- Modals trap focus correctly  

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [WCAG Guidelines](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [React TypeScript Patterns](https://react-typescript-cheatsheet.netlify.app/)
