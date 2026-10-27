"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent,SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAccounts } from "@/contexts/accounts-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/lib/types";

const formSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive."),
  date: z.date(),
  type: z.enum(["contribution", "withdrawal", "interest", "dividend"]),
});

export function AddTransactionForm({ accountId, cashOnly = false }: { accountId: string; cashOnly?: boolean }) {
  const { addTransaction, transactions, accounts } = useAccounts();
  const { toast } = useToast();
  const account = accounts.find(acc => acc.id === accountId);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "contribution",
      date: new Date(),
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (cashOnly && values.type !== 'contribution' && values.type !== 'withdrawal') {
      form.setError('type', { message: 'Choose a contribution or withdrawal.' });
      return;
    }
    const maxId = transactions.reduce((max, txn) => {
        const currentId = parseInt(txn.id.replace('txn_', ''), 10);
        return isNaN(currentId) ? max : Math.max(max, currentId);
    }, 0);
    const newId = `txn_${String(maxId + 1).padStart(5, '0')}`;

    const newTransaction = {
      id: newId,
      accountId,
      amount: values.amount,
      date: values.date.toISOString(),
      type: values.type as TransactionType,
    };
    addTransaction(newTransaction);
    toast({
      title: "Transaction added!",
      description: `Your ${values.type} of ${values.amount} has been logged.`,
    });
    form.reset({type: "contribution", date: new Date(), amount: undefined});
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="contribution">Contribution</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                  {!cashOnly && <SelectItem value="interest">Interest</SelectItem>}
                  {!cashOnly && account?.type === 'investment' && <SelectItem value="dividend">Dividend</SelectItem>}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Date</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">Add Transaction</Button>
      </form>
    </Form>
  );
}
