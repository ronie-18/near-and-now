import { render, screen } from '@testing-library/react/pure';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button component', () => {
  test('renders button with default props', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByTestId('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click me');
    expect(button).toHaveClass('bg-primary');
  });

  test('renders button with primary variant', () => {
    render(<Button variant="primary">Primary</Button>);

    const button = screen.getByTestId('button');
    expect(button).toHaveClass('bg-primary');
    expect(button).toHaveClass('hover:bg-secondary');
    expect(button).toHaveClass('text-white');
  });

  test('renders button with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);

    const button = screen.getByTestId('button');
    expect(button).toHaveClass('bg-gray-200');
    expect(button).toHaveClass('hover:bg-gray-300');
    expect(button).toHaveClass('text-gray-800');
  });

  test('renders button with outline variant', () => {
    render(<Button variant="outline">Outline</Button>);

    const button = screen.getByTestId('button');
    expect(button).toHaveClass('border');
    expect(button).toHaveClass('border-primary');
    expect(button).toHaveClass('text-primary');
    expect(button).toHaveClass('hover:bg-primary');
    expect(button).toHaveClass('hover:text-white');
  });

  test('renders button with different sizes', () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByTestId('button')).toHaveClass('px-3');
    expect(screen.getByTestId('button')).toHaveClass('py-1.5');
    expect(screen.getByTestId('button')).toHaveClass('text-sm');

    rerender(<Button size="md">Medium</Button>);
    expect(screen.getByTestId('button')).toHaveClass('px-4');
    expect(screen.getByTestId('button')).toHaveClass('py-2');
    expect(screen.getByTestId('button')).toHaveClass('text-base');

    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByTestId('button')).toHaveClass('px-6');
    expect(screen.getByTestId('button')).toHaveClass('py-3');
    expect(screen.getByTestId('button')).toHaveClass('text-lg');
  });

  test('renders full width button', () => {
    render(<Button fullWidth>Full Width</Button>);
    expect(screen.getByTestId('button')).toHaveClass('w-full');
  });

  test('renders disabled button', () => {
    render(<Button disabled>Disabled</Button>);

    const button = screen.getByTestId('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-50');
    expect(button).toHaveClass('cursor-not-allowed');
  });

  test('calls onClick handler when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByTestId('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('does not call onClick when disabled', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>Click me</Button>);

    await userEvent.click(screen.getByTestId('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });


});
