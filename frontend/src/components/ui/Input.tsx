import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, icon, id, className = '', ...props },
  ref
) {
  return (
    <div className={styles.field}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <div className={styles.inputWrapper}>
        {icon && <span className={styles.inputIcon}>{icon}</span>}
        <input
          id={id}
          ref={ref}
          {...props}
          className={`${styles.input} ${icon ? styles.withIcon : ''} ${error ? styles.hasError : ''} ${className}`}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, children, className = '', ...props },
  ref
) {
  return (
    <div className={styles.field}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <select
        id={id}
        ref={ref}
        {...props}
        className={`${styles.input} ${styles.select} ${error ? styles.hasError : ''} ${className}`}
      >
        {children}
      </select>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
});
