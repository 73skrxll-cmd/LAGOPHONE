using System;using System.Text;using System.Collections.Generic;using System.Diagnostics;using System.Runtime.InteropServices;
// A private kill-on-close job contains only this supervisor's child. Never kill by process name.
public sealed class GTMBlockingChild:IDisposable{
 [StructLayout(LayoutKind.Sequential)] struct Basic {public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
 [StructLayout(LayoutKind.Sequential)] struct Io {public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
 [StructLayout(LayoutKind.Sequential)] struct Extended {public Basic BasicLimitInformation;public Io IoInfo;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr CreateJobObject(IntPtr a,string b);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetLongPathName(string shortPath,StringBuilder longPath,uint size);
 public static string CanonicalPath(string path){path=Environment.ExpandEnvironmentVariables(path.Trim('"'));if(path.StartsWith(@"\??\",StringComparison.Ordinal)||path.StartsWith(@"\\?\",StringComparison.Ordinal))path=path.Substring(4);if(path.StartsWith(@"\SystemRoot\",StringComparison.OrdinalIgnoreCase))path=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),path.Substring(12));string full=System.IO.Path.GetFullPath(path);var text=new StringBuilder(32768);uint length=GetLongPathName(full,text,(uint)text.Capacity);return length>0&&length<text.Capacity?text.ToString():full;}

 IntPtr job;Process child;readonly Queue<string> lines=new Queue<string>();readonly object gate=new object();
 public int Pid{get{return child==null?0:child.Id;}}public bool Running{get{return child!=null&&!child.HasExited;}}public int ExitCode{get{return child!=null&&child.HasExited?child.ExitCode:0;}}public string Output{get{lock(gate)return String.Join("\n",lines.ToArray());}}
 public void Start(string exe,string arguments,string cwd){
  job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("Job creation failed");var limits=new Extended();limits.BasicLimitInformation.LimitFlags=0x2000;int size=Marshal.SizeOf(limits);IntPtr memory=Marshal.AllocHGlobal(size);try{Marshal.StructureToPtr(limits,memory,false);if(!SetInformationJobObject(job,9,memory,(uint)size))throw new Exception("Job limits failed");}finally{Marshal.FreeHGlobal(memory);}
  child=new Process();child.StartInfo=new ProcessStartInfo{FileName=exe,Arguments=arguments,WorkingDirectory=cwd,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};DataReceivedEventHandler read=(s,e)=>{if(e.Data!=null)lock(gate){lines.Enqueue(e.Data.Length>500?e.Data.Substring(0,500):e.Data);while(lines.Count>60)lines.Dequeue();}};child.OutputDataReceived+=read;child.ErrorDataReceived+=read;try{child.Start();}catch(System.ComponentModel.Win32Exception error){throw new Exception(String.Format("Native start failed ({0}; exe length {1}, arguments length {2}, cwd length {3})",error.NativeErrorCode,exe.Length,arguments.Length,cwd.Length),error);}if(!AssignProcessToJobObject(job,child.Handle)){child.Kill();throw new Exception("Child ownership failed");}child.BeginOutputReadLine();child.BeginErrorReadLine();
 }
 public void Stop(){if(job!=IntPtr.Zero){CloseHandle(job);job=IntPtr.Zero;}try{if(child!=null){if(!child.WaitForExit(2500))child.Kill();child.WaitForExit(1000);}}catch{}}
 public void Dispose(){Stop();if(child!=null)child.Dispose();}
}
