import { FC, ReactNode, FormEvent } from "react";

interface FormProps {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  className?: string;
  autoComplete?: string;
}

const Form: FC<FormProps> = ({ onSubmit, children, className, autoComplete }) => {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault(); // Prevent default form submission
        onSubmit(event);
      }}
      className={` ${className}`} // Default spacing between form fields
      autoComplete={autoComplete}
    >
      {children}
    </form>
  );
};

export default Form;
