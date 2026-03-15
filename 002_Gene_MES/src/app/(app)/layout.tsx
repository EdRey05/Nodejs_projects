
'use client';
import React, { useEffect, useState, useCallback, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AppIcon } from '@/components/icons';
import { FlaskConical, User, Settings, Home, GitFork, Wrench, Code, FileText, ChevronsUpDown, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Chatbot } from '@/components/chatbot';
import { AppContextProvider, useAppContext } from './_context/AppContext';
import { DatabaseContextProvider, useDatabase } from './_context/DatabaseContext';
import { LOG_TYPES, LogType } from '@/lib/types';
import { fetchPersistedData } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { getAppContext } = useAppContext();
  const { setDatabase } = useDatabase();
  const { toast } = useToast();
  const [isFetching, startFetching] = useTransition();
  const [pageTitle, setPageTitle] = useState('');
  
  useEffect(() => {
    const getTitle = (path: string): string => {
      const segment = path.split('/').pop() ?? '';
      const specialTitles: Record<string, string> = {
        'colony-pcr': 'Colony PCR Log',
        'dna-extraction': 'DNA Extraction Log',
        'gene-synthesis-progress': 'Gene Tracker',
      };
  
      if (specialTitles[segment]) {
        return specialTitles[segment];
      }
      
      if (segment === 'home') return 'Home';
  
      return segment.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.substring(1)).join(' ');
    };
    setPageTitle(getTitle(pathname));
  }, [pathname]);

  const loadInitialData = useCallback(() => {
    startFetching(async () => {
      await Promise.all(LOG_TYPES.map(async (logType) => {
        const result = await fetchPersistedData(logType);
        if (result.success && result.data) {
          const byteCharacters = atob(result.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          setDatabase(logType, {
            buffer: byteArray.buffer,
            name: `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`,
            images: result.images
          });
        } else if (result.message !== "No persisted data found.") {
          toast({ variant: 'destructive', title: 'Initial Load Failed', description: `Could not load ${logType}: ${result.message}` });
        }
      }));
    });
  }, [setDatabase, startFetching, toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-sidebar-foreground">
              <AppIcon className="size-6" />
            </Button>
            <span className="text-lg font-semibold text-sidebar-foreground">Gene Synthesis</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/home'} tooltip="Home">
                <Link href="/home">
                  <Home />
                  <span>Home</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === '/gene-synthesis-progress'} tooltip="Gene Tracker">
                <Link href="/gene-synthesis-progress">
                  <FileText />
                  <span>Gene Tracker</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            
            <Collapsible asChild>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>
                    <GitFork />
                    <span>Pipelines</span>
                    <ChevronsUpDown className="ml-auto h-4 w-4" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/pipelines/pipeline-1'}><Link href="/pipelines/pipeline-1">Pipeline 1</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/pipelines/pipeline-2'}><Link href="/pipelines/pipeline-2">Pipeline 2</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/pipelines/pipeline-3'}><Link href="/pipelines/pipeline-3">Pipeline 3</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            <Collapsible asChild>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>
                    <Wrench />
                    <span>Logs</span>
                    <ChevronsUpDown className="ml-auto h-4 w-4" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/logs/uploader'}><Link href="/logs/uploader">Uploader</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/logs/ligation'}><Link href="/logs/ligation">Ligation</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/logs/colony-pcr'}><Link href="/logs/colony-pcr">Colony PCR</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                     <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname === '/logs/dna-extraction'}><Link href="/logs/dna-extraction">DNA Extraction</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            <Collapsible asChild>
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton>
                    <Code />
                    <span>Developer</span>
                    <ChevronsUpDown className="ml-auto h-4 w-4" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname.startsWith('/developer/widget-playground')}><Link href="/developer/widget-playground">Widget Playground</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname.startsWith('/developer/databases')}><Link href="/developer/databases">Databases</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={pathname.startsWith('/developer/python-test')}><Link href="/developer/python-test">Python Integration</Link></SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 p-2">
                 <Avatar className="h-8 w-8">
                    <AvatarFallback><User/></AvatarFallback>
                 </Avatar>
                 <span className="text-sidebar-foreground">User Profile</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Billing</DropdownMenuItem>
                <DropdownMenuItem>Team</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                   <Settings className="mr-2 h-4 w-4" />
                   <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem>Log out</DropdownMenuItem>
            </DropdownMenuContent>
           </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b bg-background/50 backdrop-blur-sm px-6">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-xl font-semibold">
            {pageTitle}
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
      <Chatbot getAppContext={getAppContext} />
    </SidebarProvider>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppContextProvider>
      <DatabaseContextProvider>
        <LayoutContent>{children}</LayoutContent>
      </DatabaseContextProvider>
    </AppContextProvider>
  );
}
