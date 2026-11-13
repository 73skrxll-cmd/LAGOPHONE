using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
// PresentMon supplies ETW Present intervals. No game memory, hooks or overlay.
public sealed class GTMFpsCollector : IDisposable {
 public sealed class Chain { public long Count; public double Sum,Min=double.MaxValue; public Dictionary<long,long> Histogram=new Dictionary<long,long>(); public bool First=true; }
 public sealed class Session { public string Id,GameId,Name,StartedAt,GameStartedAt,CaptureStartedAt,LastAt,EndedAt; public int Pid; public bool Alive=true; public Process Game; public Dictionary<string,Chain> Chains=new Dictionary<string,Chain>(); }
 readonly object gate=new object(); readonly Dictionary<string,string[]> games=new Dictionary<string,string[]>(StringComparer.OrdinalIgnoreCase); readonly List<Session> sessions=new List<Session>(); readonly Dictionary<int,Session> active=new Dictionary<int,Session>();
 readonly string captureStartedAt=DateTime.UtcNow.ToString("o");
 Dictionary<string,int> columns; Process child; string errors=""; public bool HeaderSeen {get;private set;} public int InvalidRows {get;private set;}
 public GTMFpsCollector(string[] exes,string[] ids,string[] names){for(int i=0;i<exes.Length;i++)games[exes[i]]=new[]{ids[i],names[i]};}
 static string[] Csv(string value){var result=new List<string>();var field=new StringBuilder();bool quote=false;for(int i=0;i<value.Length;i++){char c=value[i];if(c=='"'){if(quote&&i+1<value.Length&&value[i+1]=='"'){field.Append('"');i++;}else quote=!quote;}else if(c==','&&!quote){result.Add(field.ToString());field.Clear();}else field.Append(c);}result.Add(field.ToString());return result.ToArray();}
 public void Feed(string line){if(String.IsNullOrWhiteSpace(line))return;lock(gate){try{
  var row=Csv(line.TrimStart('\uFEFF'));
  if(row[0].Equals("Application",StringComparison.OrdinalIgnoreCase)){columns=new Dictionary<string,int>(StringComparer.OrdinalIgnoreCase);for(int i=0;i<row.Length;i++)columns[row[i]]=i;HeaderSeen=columns.ContainsKey("msBetweenPresents")&&columns.ContainsKey("ProcessID")&&columns.ContainsKey("SwapChainAddress");return;}
  if(!HeaderSeen)return;
  string exe=Path.GetFileName(row[columns["Application"]]);string[] game;if(!games.TryGetValue(exe,out game))return;
  int pid;double milliseconds;if(!Int32.TryParse(row[columns["ProcessID"]],out pid)||pid<=0||!Double.TryParse(row[columns["msBetweenPresents"]],NumberStyles.Float,CultureInfo.InvariantCulture,out milliseconds)||Double.IsNaN(milliseconds)||Double.IsInfinity(milliseconds)||milliseconds<=0||milliseconds>86400000){InvalidRows++;return;}
  Session session;if(!active.TryGetValue(pid,out session)||!session.Alive||session.GameId!=game[0]){
   session=new Session{Id=Guid.NewGuid().ToString("N"),GameId=game[0],Name=game[1],Pid=pid,CaptureStartedAt=captureStartedAt,StartedAt=DateTime.UtcNow.ToString("o")};
   try{session.Game=Process.GetProcessById(pid);session.GameStartedAt=session.Game.StartTime.ToUniversalTime().ToString("o");}catch{}
   active[pid]=session;sessions.Add(session);
  }
  session.LastAt=DateTime.UtcNow.ToString("o");string address=row[columns["SwapChainAddress"]];Chain chain;if(!session.Chains.TryGetValue(address,out chain)){if(session.Chains.Count>=16){InvalidRows++;return;}chain=new Chain();session.Chains[address]=chain;}
  if(chain.First){chain.First=false;return;} // interval may begin before capture.
  chain.Count++;chain.Sum+=milliseconds;chain.Min=Math.Min(chain.Min,milliseconds);long bin=(long)Math.Ceiling(milliseconds*10);long previous;chain.Histogram.TryGetValue(bin,out previous);chain.Histogram[bin]=previous+1;
 }catch{InvalidRows++;}}}
 public void Start(string binary,string arguments){child=new Process();child.StartInfo=new ProcessStartInfo{FileName=binary,Arguments=arguments,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};child.OutputDataReceived+=(s,e)=>{if(e.Data!=null)Feed(e.Data);};child.ErrorDataReceived+=(s,e)=>{if(e.Data!=null){lock(gate){if(errors.Length<4000)errors+=e.Data+"\n";}}};child.Start();try{child.PriorityClass=ProcessPriorityClass.BelowNormal;}catch{}child.BeginOutputReadLine();child.BeginErrorReadLine();}
 public bool Exited {get{return child==null||child.HasExited;}} public string Error {get{lock(gate)return errors;}} public int ExitCode {get{return Exited&&child!=null?child.ExitCode:0;}}
 public object[] Snapshot(bool ending){lock(gate){var result=new List<object>();foreach(var session in sessions){if(session.Alive&&session.Game!=null){try{if(session.Game.HasExited){session.Alive=false;session.EndedAt=session.Game.ExitTime.ToUniversalTime().ToString("o");}}catch{}}
  Chain chain=session.Chains.Values.OrderByDescending(c=>c.Count).FirstOrDefault();if(chain==null||chain.Count==0)continue;
  result.Add(new{ id=session.Id,gameId=session.GameId,name=session.Name,startedAt=session.StartedAt,gameStartedAt=session.GameStartedAt,captureStartedAt=session.CaptureStartedAt,lastAt=session.LastAt,endedAt=session.EndedAt,alive=session.Alive&&!ending,partialEnd=ending&&session.Alive,count=chain.Count,sumMs=chain.Sum,minMs=chain.Min,histogram=chain.Histogram.ToDictionary(p=>p.Key.ToString(CultureInfo.InvariantCulture),p=>p.Value) });
 }return result.ToArray();}}
 public void Stop(string binary,string sessionName){
  if(child==null)return;
  try{using(var stop=new Process()){stop.StartInfo=new ProcessStartInfo{FileName=binary,Arguments="--session_name "+sessionName+" --terminate_existing_session --no_console_stats",UseShellExecute=false,CreateNoWindow=true};stop.Start();if(!stop.WaitForExit(2500))stop.Kill();}}catch{}
  try{if(!child.WaitForExit(1500))child.Kill();child.WaitForExit(1000);}catch{}
 }
 public void Dispose(){try{if(child!=null)child.Dispose();}catch{}foreach(var s in sessions){try{if(s.Game!=null)s.Game.Dispose();}catch{}}}
}
